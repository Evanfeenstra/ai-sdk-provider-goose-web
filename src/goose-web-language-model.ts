import type {
  LanguageModelV2,
  LanguageModelV2CallWarning,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
  JSONValue,
} from "@ai-sdk/provider";
import { APICallError } from "@ai-sdk/provider";
import { generateId } from "@ai-sdk/provider-utils";
import WebSocket from "ws";
import type {
  GooseWebSettings,
  Logger,
  GooseWebMessage,
  GooseWebResponse,
} from "./types.js";
import {
  createAPICallError,
  createConnectionError,
  createTimeoutError,
} from "./errors.js";

/**
 * Options for creating a Goose Web language model instance.
 */
export interface GooseWebLanguageModelOptions {
  /**
   * The model identifier to use.
   */
  id: GooseWebModelId;

  /**
   * Optional settings to configure the model behavior.
   */
  settings?: GooseWebSettings;
}

/**
 * Supported Goose model identifiers.
 */
export type GooseWebModelId = "goose" | (string & {});

/**
 * Helper function to validate if a session exists.
 */
async function validateSessionExistsHelper(
  wsUrl: string,
  sessionId: string,
  authToken?: string,
  logger?: Logger
): Promise<boolean> {
  const httpUrl = wsUrl
    .replace(/^wss:\/\//, "https://")
    .replace(/^ws:\/\//, "http://")
    .replace(/\/ws$/, "");

  const headers: Record<string, string> = {};
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(`${httpUrl}/api/sessions/${sessionId}`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      logger?.debug("Session validation failed - HTTP error", {
        sessionId,
        status: response.status,
      });
      return false;
    }

    const data = await response.json();

    logger?.debug("Session validation response", {
      sessionId,
      status: response.status,
      hasError: !!data.error,
    });

    return !data.error;
  } catch (error) {
    logger?.error("Failed to validate session", {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Helper function to create a new session.
 */
async function createNewSessionHelper(
  wsUrl: string,
  authToken?: string,
  logger?: Logger
): Promise<string> {
  const httpUrl = wsUrl
    .replace(/^wss:\/\//, "https://")
    .replace(/^ws:\/\//, "http://")
    .replace(/\/ws$/, "");

  logger?.debug("Creating session via REST API", { wsUrl, httpUrl });

  const headers: Record<string, string> = {};
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(httpUrl, {
      method: "GET",
      redirect: "manual",
      headers,
    });

    logger?.debug("REST API response received", {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
    });

    const location = response.headers.get("location");
    logger?.debug("Location header", { location });

    if (location && location.startsWith("/session/")) {
      const newSessionId = location.replace("/session/", "");
      logger?.debug("Session created successfully", {
        sessionId: newSessionId,
      });
      return newSessionId;
    } else {
      logger?.error("No redirect received from REST API", {
        location,
        responseStatus: response.status,
      });
      throw createConnectionError(
        "Failed to create session: No redirect received from REST API",
        { wsUrl: httpUrl, responseStatus: response.status }
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger?.error("Failed to create session via REST API", {
      httpUrl,
      error: errorMessage,
    });
    throw createConnectionError(
      `Failed to create session via REST API: ${errorMessage}`,
      { wsUrl: httpUrl }
    );
  }
}

/**
 * Language model implementation for Goose Web.
 * Connects to a Goose server via WebSocket for AI interactions.
 */
export class GooseWebLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = "v2" as const;
  readonly defaultObjectGenerationMode = "tool" as const;
  readonly provider = "goose-web" as const;
  readonly modelId: GooseWebModelId;
  readonly settings: GooseWebSettings;
  readonly supportsImageUrls = false;
  readonly supportedUrls = {};
  readonly supportsStructuredOutputs = false;

  private logger?: Logger;
  private sessionId: string;
  private sessionCreated: boolean;

  constructor(options: GooseWebLanguageModelOptions) {
    this.modelId = options.id;
    this.settings = {
      wsUrl: "ws://localhost:8080/ws",
      connectionTimeout: 30000,
      responseTimeout: 120000,
      ...options.settings,
    };
    this.logger = this.settings.logger;
    this.sessionId = this.settings.sessionId || "";
    // If assumeSessionValid is true and sessionId is provided, skip validation
    this.sessionCreated = !!(
      this.settings.assumeSessionValid && this.settings.sessionId
    );
  }

  private async validateSessionExists(sessionId: string): Promise<boolean> {
    return validateSessionExistsHelper(
      this.settings.wsUrl!,
      sessionId,
      this.settings.authToken,
      this.logger
    );
  }

  /**
   * Ensures a valid session exists, creating one if needed.
   * Call this immediately after model creation to validate the session
   * before sending any messages. This allows you to know if an old session
   * was invalidated so you can decide whether to include full conversation history.
   *
   * Note: If you've already validated the session using validateGooseSession(),
   * you can pass assumeSessionValid: true to the model settings to skip re-validation.
   *
   * @returns Object containing the sessionId and whether an old session was invalidated
   */
  public async ensureSession(): Promise<{
    sessionId: string;
    oldSessionInvalidated: boolean;
  }> {
    this.logger?.debug("ensureSession called", {
      sessionCreated: this.sessionCreated,
      sessionId: this.sessionId,
      providedSessionId: this.settings.sessionId,
    });

    if (this.sessionCreated && this.sessionId) {
      this.logger?.debug("Session already exists, skipping creation");
      return { sessionId: this.sessionId, oldSessionInvalidated: false };
    }

    // Track if we're replacing an invalid session
    let oldSessionInvalidated = false;

    // If sessionId provided in settings, validate it exists
    if (this.settings.sessionId) {
      const isValid = await this.validateSessionExists(this.settings.sessionId);

      if (isValid) {
        this.sessionId = this.settings.sessionId;
        this.sessionCreated = true;
        this.logger?.debug("Using provided session ID", {
          sessionId: this.sessionId,
        });
        return { sessionId: this.sessionId, oldSessionInvalidated: false };
      } else {
        this.logger?.warn(
          "Provided session ID is invalid, creating new session",
          {
            oldSessionId: this.settings.sessionId,
          }
        );
        // Fall through to create a new session, but remember we had an old one
        oldSessionInvalidated = true;
      }
    }

    // Create new session
    this.sessionId = await createNewSessionHelper(
      this.settings.wsUrl!,
      this.settings.authToken,
      this.logger
    );
    this.sessionCreated = true;

    return { sessionId: this.sessionId, oldSessionInvalidated };
  }

  private createWebSocket(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const wsOptions: any = {};
      if (this.settings.authToken) {
        wsOptions.headers = {
          Authorization: `Bearer ${this.settings.authToken}`,
        };
      }

      const ws = new WebSocket(this.settings.wsUrl!, wsOptions);
      const timeout = setTimeout(() => {
        ws.close();
        reject(
          createConnectionError(
            `Connection timeout after ${this.settings.connectionTimeout}ms`,
            { wsUrl: this.settings.wsUrl, sessionId: this.sessionId }
          )
        );
      }, this.settings.connectionTimeout);

      ws.onopen = () => {
        clearTimeout(timeout);
        this.logger?.debug("WebSocket connected", {
          wsUrl: this.settings.wsUrl,
        });
        resolve(ws);
      };

      ws.onerror = (error) => {
        clearTimeout(timeout);
        this.logger?.error("WebSocket connection error", error);
        reject(
          createConnectionError("Failed to connect to Goose server", {
            wsUrl: this.settings.wsUrl,
            sessionId: this.sessionId,
          })
        );
      };
    });
  }

  async doGenerate(options: Parameters<LanguageModelV2["doGenerate"]>[0]) {
    const { prompt, responseFormat, ...rest } = options;

    // Ensure session exists before creating WebSocket
    await this.ensureSession();

    // Convert messages to a single text prompt for Goose
    let userMessage = this.convertPromptToText(prompt);

    // Add JSON format instruction if needed
    if (responseFormat?.type === "json") {
      userMessage += "\n\nPlease respond with valid JSON only.";
      if (responseFormat.schema) {
        userMessage += ` Follow this JSON schema: ${JSON.stringify(
          responseFormat.schema
        )}`;
      }
    }

    const ws = await this.createWebSocket();

    try {
      const result = await this.generateResponse(ws, userMessage, false);

      // Extract JSON if responseFormat indicates JSON mode
      if (
        responseFormat?.type === "json" &&
        result.content?.[0]?.type === "text"
      ) {
        const extractedJson = this.extractJson(result.content[0].text);
        result.content[0].text = extractedJson;
      }

      return result;
    } finally {
      ws.close();
    }
  }

  async doStream(
    options: Parameters<LanguageModelV2["doStream"]>[0]
  ): Promise<Awaited<ReturnType<LanguageModelV2["doStream"]>>> {
    const { prompt, responseFormat, ...rest } = options;

    // Ensure session exists before creating WebSocket
    await this.ensureSession();

    // Convert messages to a single text prompt for Goose
    let userMessage = this.convertPromptToText(prompt);

    // Add JSON format instruction if needed
    if (responseFormat?.type === "json") {
      userMessage += "\n\nPlease respond with valid JSON only.";
      if (responseFormat.schema) {
        userMessage += ` Follow this JSON schema: ${JSON.stringify(
          responseFormat.schema
        )}`;
      }
    }

    const ws = await this.createWebSocket();

    const stream = this.createStreamFromAsyncGenerator(
      this.streamResponse(ws, userMessage),
      responseFormat
    );

    return {
      stream,
      request: {
        body: userMessage,
      },
    };
  }

  private convertPromptToText(
    prompt: Parameters<LanguageModelV2["doGenerate"]>[0]["prompt"]
  ): string {
    // Handle array of messages (most common case)
    if (Array.isArray(prompt)) {
      const messages: string[] = [];

      for (const message of prompt) {
        if (!message || typeof message !== "object") continue;

        switch (message.role) {
          case "system":
            // Add system message as context
            if (typeof message.content === "string") {
              messages.unshift(`System: ${message.content}`);
            }
            break;

          case "user":
          case "assistant":
            if (typeof message.content === "string") {
              messages.push(message.content);
            } else if (Array.isArray(message.content)) {
              // Handle multi-part content
              const textParts = message.content
                .filter((part) => part && part.type === "text")
                .map((part) => {
                  // Type guard to ensure we have a text part
                  if (part.type === "text" && "text" in part) {
                    return part.text;
                  }
                  return "";
                })
                .filter(Boolean);
              if (textParts.length > 0) {
                messages.push(textParts.join(" "));
              }
            }
            break;
        }
      }

      return messages.join("\n\n");
    }

    // Handle string prompt
    if (typeof prompt === "string") {
      return prompt;
    }

    // Fallback for unknown format
    return String(prompt || "");
  }

  private async generateResponse(
    ws: WebSocket,
    message: string,
    streaming: boolean
  ) {
    return new Promise<any>((resolve, reject) => {
      let responseText = "";
      let usage: LanguageModelV2Usage = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };

      const timeout = setTimeout(() => {
        ws.close();
        reject(
          createTimeoutError(this.settings.responseTimeout!, {
            wsUrl: this.settings.wsUrl,
            sessionId: this.sessionId,
            lastMessage: message,
          })
        );
      }, this.settings.responseTimeout);

      ws.onmessage = (event) => {
        try {
          const data: GooseWebResponse = JSON.parse(event.data.toString());
          this.logger?.debug("Received WebSocket message", data);

          switch (data.type) {
            case "response":
              if (data.content) {
                responseText += data.content;
              }
              break;

            case "complete":
              clearTimeout(timeout);
              resolve({
                content: [{ type: "text", text: responseText }],
                finishReason: "stop" as LanguageModelV2FinishReason,
                usage,
                warnings: [],
                response: {
                  id: generateId(),
                  timestamp: new Date(),
                  modelId: this.modelId,
                },
                request: {
                  body: message,
                },
                providerMetadata: {
                  "goose-web": {
                    sessionId: this.sessionId,
                  },
                },
              });
              break;

            case "error":
              clearTimeout(timeout);
              reject(
                createAPICallError(
                  data.message || "Unknown error from Goose server",
                  {
                    wsUrl: this.settings.wsUrl,
                    sessionId: this.sessionId,
                    lastMessage: message,
                  }
                )
              );
              break;
          }
        } catch (error) {
          this.logger?.error("Failed to parse WebSocket message", error);
        }
      };

      ws.onerror = (error) => {
        clearTimeout(timeout);
        reject(
          createConnectionError("WebSocket error during generation", {
            wsUrl: this.settings.wsUrl,
            sessionId: this.sessionId,
          })
        );
      };

      ws.onclose = (event) => {
        if (event.code !== 1000) {
          clearTimeout(timeout);
          reject(
            createConnectionError(
              `WebSocket closed unexpectedly: ${event.code} ${event.reason}`,
              { wsUrl: this.settings.wsUrl, sessionId: this.sessionId }
            )
          );
        }
      };

      // Send the message
      const gooseMessage: GooseWebMessage = {
        type: "message",
        content: message,
        session_id: this.sessionId,
        timestamp: Date.now(),
      };

      ws.send(JSON.stringify(gooseMessage));
      this.logger?.debug("Sent message to Goose server", gooseMessage);
    });
  }

  private async *streamResponse(
    ws: WebSocket,
    message: string
  ): AsyncGenerator<LanguageModelV2StreamPart> {
    let responseText = "";
    let finished = false;
    let currentStreamingMessage: {
      textPartId: string;
      content: string;
    } | null = null;
    let textStartEmitted = false;

    const messageQueue: LanguageModelV2StreamPart[] = [];
    let resolveNext:
      | ((value: IteratorResult<LanguageModelV2StreamPart>) => void)
      | null = null;
    let pendingTextStart: LanguageModelV2StreamPart | null = null;

    const timeout = setTimeout(() => {
      ws.close();
      if (resolveNext) {
        resolveNext({ done: true, value: undefined });
      }
    }, this.settings.responseTimeout);

    const enqueueStreamPart = (part: LanguageModelV2StreamPart) => {
      this.logger?.debug("Enqueueing stream part:", part);

      // Special handling for text-start: store it but don't yield immediately
      if (part.type === "text-start") {
        pendingTextStart = part;
        return;
      }

      // For text-delta: yield text-start first if we have one
      if (part.type === "text-delta" && pendingTextStart) {
        // Always queue text-start first, then text-delta
        messageQueue.push(pendingTextStart);
        messageQueue.push(part);
        pendingTextStart = null;

        // Wake up the generator if it's waiting
        if (resolveNext) {
          const resolve = resolveNext;
          resolveNext = null;
          resolve({ done: false, value: null as any });
        }
        return;
      }

      // Default enqueueing: always add to queue and wake up generator
      messageQueue.push(part);

      if (resolveNext) {
        this.logger?.debug(`Waking up generator for queued part: ${part.type}`);
        const resolve = resolveNext;
        resolveNext = null;
        resolve({ done: false, value: null as any });
      } else {
        this.logger?.debug(`No resolveNext, part queued: ${part.type}`);
      }
    };

    ws.onmessage = (event) => {
      try {
        const data: GooseWebResponse = JSON.parse(event.data.toString());
        this.logger?.debug("Received WebSocket message", data);

        switch (data.type) {
          case "response":
            if (data.content) {
              responseText += data.content;

              // If this is the first chunk of any content, emit text-start once
              if (!textStartEmitted) {
                const textPartId = generateId();
                currentStreamingMessage = {
                  textPartId,
                  content: data.content,
                };
                textStartEmitted = true;

                // Start new text part
                enqueueStreamPart({
                  type: "text-start",
                  id: textPartId,
                });

                enqueueStreamPart({
                  type: "text-delta",
                  id: textPartId,
                  delta: data.content,
                });
              } else if (currentStreamingMessage) {
                // Continue existing streaming message
                currentStreamingMessage.content += data.content;

                enqueueStreamPart({
                  type: "text-delta",
                  id: currentStreamingMessage.textPartId,
                  delta: data.content,
                });
              }
            }
            break;

          case "tool_request":
            // End current streaming message if we were in the middle of one (matches Goose web client)
            if (currentStreamingMessage) {
              enqueueStreamPart({
                type: "text-end",
                id: currentStreamingMessage.textPartId,
              });
              // Reset streaming message so tool doesn't interfere with message flow
              currentStreamingMessage = null;
            }

            // Reset textStartEmitted so that content after tools can create new text parts
            textStartEmitted = false;

            // Emit tool call
            enqueueStreamPart({
              type: "tool-call",
              toolCallId: data.id || generateId(),
              toolName: data.tool_name || "unknown",
              input: JSON.stringify(data.arguments || {}),
            });
            break;

          case "tool_response":
            // Reset streaming message so next assistant response creates a new message (matches Goose web client)
            currentStreamingMessage = null;
            textStartEmitted = false; // Allow new text parts after tool calls

            // Emit tool result if we have a matching tool call
            if (data.result) {
              const toolResult = Array.isArray(data.result)
                ? data.result.map((r) => r.text || JSON.stringify(r)).join("\n")
                : typeof data.result === "string"
                ? data.result
                : JSON.stringify(data.result);

              enqueueStreamPart({
                type: "tool-result",
                toolCallId: data.id || generateId(),
                toolName: data.tool_name || "unknown",
                result: toolResult,
              });
            }
            break;

          case "complete":
            clearTimeout(timeout);
            finished = true;

            // Finalize any streaming message (matches Goose web client)
            if (currentStreamingMessage) {
              enqueueStreamPart({
                type: "text-end",
                id: currentStreamingMessage.textPartId,
              });
              currentStreamingMessage = null;
            }

            // Emit finish
            enqueueStreamPart({
              type: "finish",
              finishReason: "stop",
              usage: {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
              },
              providerMetadata: {
                "goose-web": {
                  sessionId: this.sessionId,
                },
              },
            });
            break;

          case "error":
            clearTimeout(timeout);
            finished = true;

            // End any streaming message if we were in the middle of one
            if (currentStreamingMessage) {
              enqueueStreamPart({
                type: "text-end",
                id: currentStreamingMessage.textPartId,
              });
              currentStreamingMessage = null;
            }

            enqueueStreamPart({
              type: "error",
              error: createAPICallError(
                data.message || "Unknown error from Goose server",
                {
                  wsUrl: this.settings.wsUrl,
                  sessionId: this.sessionId,
                  lastMessage: message,
                }
              ),
            });
            break;
        }
      } catch (error) {
        this.logger?.error("Failed to parse WebSocket message", error);
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      finished = true;
      const errorPart: LanguageModelV2StreamPart = {
        type: "error",
        error: createConnectionError("WebSocket error during streaming", {
          wsUrl: this.settings.wsUrl,
          sessionId: this.sessionId,
        }),
      };

      if (resolveNext) {
        resolveNext({ done: false, value: errorPart });
        resolveNext = null;
      } else {
        messageQueue.push(errorPart);
      }
    };

    // Send the message
    const gooseMessage: GooseWebMessage = {
      type: "message",
      content: message,
      session_id: this.sessionId,
      timestamp: Date.now(),
    };

    ws.send(JSON.stringify(gooseMessage));
    this.logger?.debug("Sent message to Goose server", gooseMessage);

    // Generator loop
    while (!finished || messageQueue.length > 0) {
      this.logger?.debug(
        `Generator loop: finished=${finished}, queue length=${messageQueue.length}`
      );
      if (messageQueue.length > 0) {
        const part = messageQueue.shift()!;
        this.logger?.debug(`Yielding part: ${part.type}`);
        yield part;
      } else {
        this.logger?.debug("Waiting for next message...");
        await new Promise<void>((resolve) => {
          resolveNext = (result) => {
            if (!result.done) {
              resolve();
            }
          };
        });
        this.logger?.debug("Generator woken up, checking queue...");
      }
    }

    ws.close();
  }

  private createStreamFromAsyncGenerator(
    generator: AsyncGenerator<LanguageModelV2StreamPart>,
    responseFormat?: { type: "json"; schema?: unknown } | { type: "text" }
  ): ReadableStream<LanguageModelV2StreamPart> {
    const self = this;
    let iteratorRunning = false;

    return new ReadableStream<LanguageModelV2StreamPart>(
      {
        async start(controller) {
          // Start consuming the generator immediately in the background
          // This ensures we process WebSocket messages as they arrive
          if (!iteratorRunning) {
            iteratorRunning = true;
            (async () => {
              try {
                let accumulatedText = "";

                for await (const part of generator) {
                  // Accumulate text for JSON extraction
                  if (part.type === "text-delta") {
                    accumulatedText += part.delta;
                  }

                  // Handle JSON extraction on finish for JSON mode
                  if (
                    part.type === "finish" &&
                    responseFormat?.type === "json" &&
                    accumulatedText
                  ) {
                    const extractedJson = self.extractJson(accumulatedText);
                    if (extractedJson !== accumulatedText) {
                      // Emit a new text sequence with just the JSON
                      const jsonId = generateId();
                      controller.enqueue({ type: "text-start", id: jsonId });
                      controller.enqueue({
                        type: "text-delta",
                        id: jsonId,
                        delta: extractedJson,
                      });
                      controller.enqueue({ type: "text-end", id: jsonId });
                    }
                  }

                  // Skip text parts in JSON mode since we'll emit clean JSON
                  if (
                    responseFormat?.type === "json" &&
                    (part.type === "text-start" ||
                      part.type === "text-delta" ||
                      part.type === "text-end")
                  ) {
                    continue;
                  }

                  controller.enqueue(part);
                }

                controller.close();
              } catch (error) {
                controller.error(error);
              }
            })();
          }
        },
      },
      // Add a high water mark to minimize buffering - parts should flow through immediately
      new CountQueuingStrategy({ highWaterMark: 1 })
    );
  }

  /**
   * Extracts JSON from a text response that might contain other text.
   * Looks for JSON objects or arrays and returns the first valid one found.
   */
  private extractJson(text: string): string {
    // Try to find JSON in the text
    const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        // Validate that it's valid JSON
        JSON.parse(jsonMatch[0]);
        return jsonMatch[0];
      } catch (e) {
        // If not valid JSON, return the original text
        return text;
      }
    }

    // If no JSON found, return original text
    return text;
  }
}

/**
 * Standalone function to validate a Goose session.
 * Call this before creating a model to check if a session exists and get a valid session ID.
 *
 * @param settings - Configuration including wsUrl and optional sessionId
 * @returns Object containing the sessionId and whether an old session was invalidated
 *
 * @example
 * ```typescript
 * const { sessionId, oldSessionInvalidated } = await validateGooseSession({
 *   wsUrl: "ws://localhost:8080/ws",
 *   sessionId: "old_session_id", // optional
 *   authToken: "your-auth-token", // optional
 * });
 *
 * if (oldSessionInvalidated) {
 *   // Send full conversation history
 * }
 *
 * // Pass assumeSessionValid: true to skip re-validation in the model
 * const model = gooseWeb("goose", {
 *   wsUrl,
 *   sessionId,
 *   authToken,
 *   assumeSessionValid: true  // Skip validation since we just validated it
 * });
 * ```
 */
export async function validateGooseSession(settings: {
  wsUrl: string;
  sessionId?: string;
  authToken?: string;
  logger?: Logger;
}): Promise<{ sessionId: string; oldSessionInvalidated: boolean }> {
  const { wsUrl, sessionId, authToken, logger } = settings;

  // Main validation logic
  let oldSessionInvalidated = false;

  if (sessionId) {
    const isValid = await validateSessionExistsHelper(
      wsUrl,
      sessionId,
      authToken,
      logger
    );

    if (isValid) {
      logger?.debug("Using provided session ID", { sessionId });
      return { sessionId, oldSessionInvalidated: false };
    } else {
      logger?.warn("Provided session ID is invalid, creating new session", {
        oldSessionId: sessionId,
      });
      oldSessionInvalidated = true;
    }
  }

  // Create new session
  const newSessionId = await createNewSessionHelper(wsUrl, authToken, logger);
  return { sessionId: newSessionId, oldSessionInvalidated };
}
