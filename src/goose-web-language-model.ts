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
    const { prompt, ...rest } = options;
    
    // Convert messages to a single text prompt for Goose
    const userMessage = this.convertPromptToText(prompt);
    
    const ws = await this.createWebSocket();
    
    try {
      return await this.generateResponse(ws, userMessage, false);
    } finally {
      ws.close();
    }
  }

  async doStream(options: Parameters<LanguageModelV2['doStream']>[0]): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const { prompt, ...rest } = options;
    
    // Convert messages to a single text prompt for Goose
    const userMessage = this.convertPromptToText(prompt);
    
    const ws = await this.createWebSocket();
    
    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      start: async (controller) => {
        try {
          for await (const part of this.streamResponse(ws, userMessage)) {
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
    
    const messageQueue: LanguageModelV2StreamPart[] = [];
    let resolveNext: ((value: IteratorResult<LanguageModelV2StreamPart>) => void) | null = null;
    
    const timeout = setTimeout(() => {
      ws.close();
      if (resolveNext) {
        resolveNext({ done: true, value: undefined });
      }
    }, this.settings.responseTimeout);

    ws.onmessage = (event) => {
      try {
        const data: GooseWebResponse = JSON.parse(event.data.toString());
        this.logger?.debug('Received WebSocket message', data);
        
        let streamPart: LanguageModelV2StreamPart | null = null;
        
        switch (data.type) {
          case 'response':
            if (data.content) {
              responseText += data.content;
              streamPart = {
                type: 'text-delta',
                id: generateId(),
                delta: data.content,
              };
            }
            break;
          
          case 'complete':
            clearTimeout(timeout);
            finished = true;
            streamPart = {
              type: 'finish',
              finishReason: 'stop',
              usage: {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
              },
            };
            break;
          
          case 'error':
            clearTimeout(timeout);
            finished = true;
            streamPart = {
              type: 'error',
              error: createAPICallError(
                data.message || 'Unknown error from Goose server',
                { wsUrl: this.settings.wsUrl, sessionId: this.sessionId, lastMessage: message }
              ),
            };
            break;
        }
        
        if (streamPart) {
          if (resolveNext) {
            resolveNext({ done: false, value: streamPart });
            resolveNext = null;
          } else {
            messageQueue.push(streamPart);
          }
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
}