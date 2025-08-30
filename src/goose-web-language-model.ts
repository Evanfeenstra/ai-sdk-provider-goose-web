import type {
  LanguageModelV2,
  LanguageModelV2CallWarning,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
  JSONValue,
} from '@ai-sdk/provider';
import { APICallError } from '@ai-sdk/provider';
import { generateId } from '@ai-sdk/provider-utils';
import WebSocket from 'ws';
import type { GooseWebSettings, Logger, GooseWebMessage, GooseWebResponse } from './types.js';
import { createAPICallError, createConnectionError, createTimeoutError } from './errors.js';

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
export type GooseWebModelId = 'goose' | (string & {});

/**
 * Language model implementation for Goose Web.
 * Connects to a Goose server via WebSocket for AI interactions.
 */
export class GooseWebLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2' as const;
  readonly defaultObjectGenerationMode = 'tool' as const;
  readonly provider = 'goose-web' as const;
  readonly modelId: GooseWebModelId;
  readonly settings: GooseWebSettings;
  readonly supportsImageUrls = false;
  readonly supportedUrls = {};
  readonly supportsStructuredOutputs = false;

  private logger?: Logger;
  private sessionId: string;

  constructor(options: GooseWebLanguageModelOptions) {
    this.modelId = options.id;
    this.settings = {
      wsUrl: 'ws://localhost:8080/ws',
      connectionTimeout: 30000,
      responseTimeout: 120000,
      ...options.settings,
    };
    this.logger = this.settings.logger;
    this.sessionId = this.settings.sessionId || this.generateSessionId();
  }

  private generateSessionId(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}_${hour}${minute}${second}`;
  }

  private createWebSocket(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.settings.wsUrl!);
      const timeout = setTimeout(() => {
        ws.close();
        reject(createConnectionError(
          `Connection timeout after ${this.settings.connectionTimeout}ms`,
          { wsUrl: this.settings.wsUrl, sessionId: this.sessionId }
        ));
      }, this.settings.connectionTimeout);

      ws.onopen = () => {
        clearTimeout(timeout);
        this.logger?.debug('WebSocket connected', { wsUrl: this.settings.wsUrl });
        resolve(ws);
      };

      ws.onerror = (error) => {
        clearTimeout(timeout);
        this.logger?.error('WebSocket connection error', error);
        reject(createConnectionError(
          'Failed to connect to Goose server',
          { wsUrl: this.settings.wsUrl, sessionId: this.sessionId }
        ));
      };
    });
  }

  async doGenerate(options: Parameters<LanguageModelV2['doGenerate']>[0]) {
    const { prompt, responseFormat, ...rest } = options;
    
    // Convert messages to a single text prompt for Goose
    let userMessage = this.convertPromptToText(prompt);
    
    // Add JSON format instruction if needed
    if (responseFormat?.type === 'json') {
      userMessage += '\n\nPlease respond with valid JSON only.';
      if (responseFormat.schema) {
        userMessage += ` Follow this JSON schema: ${JSON.stringify(responseFormat.schema)}`;
      }
    }
    
    const ws = await this.createWebSocket();
    
    try {
      const result = await this.generateResponse(ws, userMessage, false);
      
      // Extract JSON if responseFormat indicates JSON mode
      if (responseFormat?.type === 'json' && result.text) {
        result.text = this.extractJson(result.text);
      }
      
      return result;
    } finally {
      ws.close();
    }
  }

  async doStream(options: Parameters<LanguageModelV2['doStream']>[0]): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const { prompt, responseFormat, ...rest } = options;
    
    // Convert messages to a single text prompt for Goose
    let userMessage = this.convertPromptToText(prompt);
    
    // Add JSON format instruction if needed
    if (responseFormat?.type === 'json') {
      userMessage += '\n\nPlease respond with valid JSON only.';
      if (responseFormat.schema) {
        userMessage += ` Follow this JSON schema: ${JSON.stringify(responseFormat.schema)}`;
      }
    }
    
    const ws = await this.createWebSocket();
    
    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      start: async (controller) => {
        try {
          let accumulatedText = '';
          
          for await (const part of this.streamResponse(ws, userMessage)) {
            // Accumulate text for JSON extraction
            if (part.type === 'text-delta') {
              accumulatedText += part.delta;
            }
            
            // Handle JSON extraction on finish for JSON mode
            if (part.type === 'finish' && responseFormat?.type === 'json' && accumulatedText) {
              const extractedJson = this.extractJson(accumulatedText);
              if (extractedJson !== accumulatedText) {
                // Emit a new text sequence with just the JSON
                const jsonId = generateId();
                controller.enqueue({ type: 'text-start', id: jsonId });
                controller.enqueue({ type: 'text-delta', id: jsonId, delta: extractedJson });
                controller.enqueue({ type: 'text-end', id: jsonId });
              }
            }
            
            // Skip text parts in JSON mode since we'll emit clean JSON
            if (responseFormat?.type === 'json' && (part.type === 'text-start' || part.type === 'text-delta' || part.type === 'text-end')) {
              continue;
            }
            
            controller.enqueue(part);
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return {
      stream,
      request: {
        body: userMessage,
      },
    };
  }

  private convertPromptToText(prompt: any): string {
    if (typeof prompt === 'string') {
      return prompt;
    }
    
    if (Array.isArray(prompt)) {
      return prompt
        .filter(msg => msg.role === 'user' || msg.role === 'assistant')
        .map(msg => {
          if (typeof msg.content === 'string') {
            return msg.content;
          }
          if (Array.isArray(msg.content)) {
            return msg.content
              .filter((part: any) => part.type === 'text')
              .map((part: any) => part.text)
              .join(' ');
          }
          return '';
        })
        .join('\n\n');
    }
    
    return String(prompt);
  }

  private async generateResponse(ws: WebSocket, message: string, streaming: boolean) {
    return new Promise<any>((resolve, reject) => {
      let responseText = '';
      let usage: LanguageModelV2Usage = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };
      
      const timeout = setTimeout(() => {
        ws.close();
        reject(createTimeoutError(
          this.settings.responseTimeout!,
          { wsUrl: this.settings.wsUrl, sessionId: this.sessionId, lastMessage: message }
        ));
      }, this.settings.responseTimeout);

      ws.onmessage = (event) => {
        try {
          const data: GooseWebResponse = JSON.parse(event.data.toString());
          this.logger?.debug('Received WebSocket message', data);
          
          switch (data.type) {
            case 'response':
              if (data.content) {
                responseText += data.content;
              }
              break;
            
            case 'complete':
              clearTimeout(timeout);
              resolve({
                text: responseText,
                finishReason: 'stop' as LanguageModelV2FinishReason,
                usage,
                warnings: [],
                rawCall: { rawPrompt: message, rawSettings: this.settings },
              });
              break;
            
            case 'error':
              clearTimeout(timeout);
              reject(createAPICallError(
                data.message || 'Unknown error from Goose server',
                { wsUrl: this.settings.wsUrl, sessionId: this.sessionId, lastMessage: message }
              ));
              break;
          }
        } catch (error) {
          this.logger?.error('Failed to parse WebSocket message', error);
        }
      };

      ws.onerror = (error) => {
        clearTimeout(timeout);
        reject(createConnectionError(
          'WebSocket error during generation',
          { wsUrl: this.settings.wsUrl, sessionId: this.sessionId }
        ));
      };

      ws.onclose = (event) => {
        if (event.code !== 1000) {
          clearTimeout(timeout);
          reject(createConnectionError(
            `WebSocket closed unexpectedly: ${event.code} ${event.reason}`,
            { wsUrl: this.settings.wsUrl, sessionId: this.sessionId }
          ));
        }
      };

      // Send the message
      const gooseMessage: GooseWebMessage = {
        type: 'message',
        content: message,
        session_id: this.sessionId,
        timestamp: Date.now(),
      };
      
      ws.send(JSON.stringify(gooseMessage));
      this.logger?.debug('Sent message to Goose server', gooseMessage);
    });
  }

  private async* streamResponse(ws: WebSocket, message: string): AsyncGenerator<LanguageModelV2StreamPart> {
    let responseText = '';
    let finished = false;
    let currentStreamingMessage: { textPartId: string; content: string } | null = null;
    
    const messageQueue: LanguageModelV2StreamPart[] = [];
    let resolveNext: ((value: IteratorResult<LanguageModelV2StreamPart>) => void) | null = null;
    
    const timeout = setTimeout(() => {
      ws.close();
      if (resolveNext) {
        resolveNext({ done: true, value: undefined });
      }
    }, this.settings.responseTimeout);

    const enqueueStreamPart = (part: LanguageModelV2StreamPart) => {
      if (resolveNext) {
        resolveNext({ done: false, value: part });
        resolveNext = null;
      } else {
        messageQueue.push(part);
      }
    };

    ws.onmessage = (event) => {
      try {
        const data: GooseWebResponse = JSON.parse(event.data.toString());
        this.logger?.debug('Received WebSocket message', data);
        
        switch (data.type) {
          case 'response':
            if (data.content) {
              responseText += data.content;
              
              // If this is the first chunk of a new message, or we don't have a current streaming message
              if (!currentStreamingMessage) {
                const textPartId = generateId();
                currentStreamingMessage = {
                  textPartId,
                  content: data.content,
                };
                
                // Start new text part
                enqueueStreamPart({
                  type: 'text-start',
                  id: textPartId,
                });
                
                enqueueStreamPart({
                  type: 'text-delta',
                  id: textPartId,
                  delta: data.content,
                });
              } else {
                // Append to existing streaming message
                currentStreamingMessage.content += data.content;
                
                enqueueStreamPart({
                  type: 'text-delta',
                  id: currentStreamingMessage.textPartId,
                  delta: data.content,
                });
              }
            }
            break;
          
          case 'tool_request':
            // End current streaming message if we were in the middle of one (matches Goose web client)
            if (currentStreamingMessage) {
              enqueueStreamPart({
                type: 'text-end',
                id: currentStreamingMessage.textPartId,
              });
              // Reset streaming message so tool doesn't interfere with message flow
              currentStreamingMessage = null;
            }
            
            // Emit tool call
            enqueueStreamPart({
              type: 'tool-call',
              toolCallId: data.id || generateId(),
              toolName: data.tool_name || 'unknown',
              input: JSON.stringify(data.arguments || {}),
            });
            break;
          
          case 'tool_response':
            // Reset streaming message so next assistant response creates a new message (matches Goose web client)
            currentStreamingMessage = null;
            
            // Emit tool result if we have a matching tool call
            if (data.result) {
              const toolResult = Array.isArray(data.result) 
                ? data.result.map(r => r.text || JSON.stringify(r)).join('\n')
                : (typeof data.result === 'string' ? data.result : JSON.stringify(data.result));
                
              enqueueStreamPart({
                type: 'tool-result',
                toolCallId: data.id || generateId(),
                toolName: data.tool_name || 'unknown',
                result: toolResult,
              });
            }
            break;
          
          case 'complete':
            clearTimeout(timeout);
            finished = true;
            
            // Finalize any streaming message (matches Goose web client)
            if (currentStreamingMessage) {
              enqueueStreamPart({
                type: 'text-end',
                id: currentStreamingMessage.textPartId,
              });
              currentStreamingMessage = null;
            }
            
            // Emit finish
            enqueueStreamPart({
              type: 'finish',
              finishReason: 'stop',
              usage: {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
              },
            });
            break;
          
          case 'error':
            clearTimeout(timeout);
            finished = true;
            
            // End any streaming message if we were in the middle of one
            if (currentStreamingMessage) {
              enqueueStreamPart({
                type: 'text-end',
                id: currentStreamingMessage.textPartId,
              });
              currentStreamingMessage = null;
            }
            
            enqueueStreamPart({
              type: 'error',
              error: createAPICallError(
                data.message || 'Unknown error from Goose server',
                { wsUrl: this.settings.wsUrl, sessionId: this.sessionId, lastMessage: message }
              ),
            });
            break;
        }
      } catch (error) {
        this.logger?.error('Failed to parse WebSocket message', error);
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      finished = true;
      const errorPart: LanguageModelV2StreamPart = {
        type: 'error',
        error: createConnectionError(
          'WebSocket error during streaming',
          { wsUrl: this.settings.wsUrl, sessionId: this.sessionId }
        ),
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
      type: 'message',
      content: message,
      session_id: this.sessionId,
      timestamp: Date.now(),
    };
    
    ws.send(JSON.stringify(gooseMessage));
    this.logger?.debug('Sent message to Goose server', gooseMessage);
    
    // Generator loop
    while (!finished || messageQueue.length > 0) {
      if (messageQueue.length > 0) {
        yield messageQueue.shift()!;
      } else {
        await new Promise<void>((resolve) => {
          resolveNext = (result) => {
            if (!result.done) {
              resolve();
            }
          };
        });
      }
    }
    
    ws.close();
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