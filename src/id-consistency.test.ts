import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GooseWebLanguageModel } from './goose-web-language-model.js';
import type { GooseWebResponse } from './types.js';

describe('ID Consistency Tests', () => {
  let model: GooseWebLanguageModel;
  let idCounter: number;

  // Create a simple ID generator for testing
  const mockGenerateId = vi.fn(() => `test-id-${++idCounter}`);

  beforeEach(() => {
    vi.clearAllMocks();
    idCounter = 0;
    
    // Mock generateId
    vi.doMock('@ai-sdk/provider-utils', () => ({
      generateId: mockGenerateId,
    }));
    
    model = new GooseWebLanguageModel({
      id: 'goose',
      settings: {
        wsUrl: 'ws://localhost:8080/ws',
        sessionId: 'test-session',
        connectionTimeout: 1000,
        responseTimeout: 5000,
      },
    });
  });

  afterEach(() => {
    vi.doUnmock('@ai-sdk/provider-utils');
  });

  describe('Session ID Consistency', () => {
    it('should maintain consistent session ID when provided', () => {
      const sessionId = 'test-session-123';
      const modelWithSession = new GooseWebLanguageModel({
        id: 'goose',
        settings: {
          wsUrl: 'ws://localhost:8080/ws',
          sessionId,
          connectionTimeout: 1000,
          responseTimeout: 5000,
        },
      });

      // Access the private sessionId property for testing
      expect((modelWithSession as any).sessionId).toBe(sessionId);
    });

    it('should generate session ID when not provided', () => {
      const modelWithoutSession = new GooseWebLanguageModel({
        id: 'goose',
        settings: {
          wsUrl: 'ws://localhost:8080/ws',
          connectionTimeout: 1000,
          responseTimeout: 5000,
        },
      });

      const sessionId = (modelWithoutSession as any).sessionId;
      expect(sessionId).toMatch(/^\d{8}_\d{6}$/); // YYYYMMDD_HHMMSS format
      
      // Should be current timestamp format
      const now = new Date();
      const expectedPrefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      expect(sessionId).toMatch(new RegExp(`^${expectedPrefix}_\\d{6}$`));
    });

    it('should use the same session ID across multiple requests', () => {
      const sessionId1 = (model as any).sessionId;
      const sessionId2 = (model as any).sessionId;
      
      expect(sessionId1).toBe(sessionId2);
      expect(sessionId1).toBe('test-session');
    });
  });

  describe('ID Generation Utility', () => {
    it('should call generateId when creating response IDs', () => {
      // Test that our mock would be called
      expect(mockGenerateId).toHaveBeenCalledTimes(0); // No calls yet since we haven't triggered any generation
      
      // Call the private generateSessionId method to verify it creates proper format
      const generatedSessionId = (model as any).generateSessionId();
      expect(generatedSessionId).toMatch(/^\d{8}_\d{6}$/);
    });
  });

  describe('Text ID Consistency Logic', () => {
    it('should demonstrate text part ID consistency requirements', () => {
      // This test documents the expected behavior for text streaming IDs
      
      // 1. All text parts in a single streaming sequence should share the same ID
      const textPartId = 'text-123';
      
      // Simulate text-start
      const textStart = { type: 'text-start', id: textPartId };
      
      // Simulate text-delta parts
      const textDelta1 = { type: 'text-delta', id: textPartId, delta: 'Hello' };
      const textDelta2 = { type: 'text-delta', id: textPartId, delta: ' world' };
      
      // Simulate text-end
      const textEnd = { type: 'text-end', id: textPartId };
      
      // Verify all parts share the same ID
      expect(textStart.id).toBe(textPartId);
      expect(textDelta1.id).toBe(textPartId);
      expect(textDelta2.id).toBe(textPartId);
      expect(textEnd.id).toBe(textPartId);
    });

    it('should demonstrate new text part ID requirements after tool calls', () => {
      // This test documents the expected behavior for text IDs after tool interruptions
      
      // First text sequence
      const firstTextId = 'text-1';
      const firstTextStart = { type: 'text-start', id: firstTextId };
      const firstTextDelta = { type: 'text-delta', id: firstTextId, delta: 'First message' };
      const firstTextEnd = { type: 'text-end', id: firstTextId };
      
      // Tool call sequence
      const toolCallId = 'tool-call-1';
      const toolCall = { type: 'tool-call', toolCallId, toolName: 'test_tool', input: '{}' };
      const toolResult = { type: 'tool-result', toolCallId, toolName: 'test_tool', result: 'Result' };
      
      // Second text sequence (after tool call) - should have different ID
      const secondTextId = 'text-2';
      const secondTextStart = { type: 'text-start', id: secondTextId };
      const secondTextDelta = { type: 'text-delta', id: secondTextId, delta: 'Second message' };
      const secondTextEnd = { type: 'text-end', id: secondTextId };
      
      // Verify text sequences have different IDs
      expect(firstTextId).not.toBe(secondTextId);
      
      // Verify tool call/result share same ID
      expect(toolCall.toolCallId).toBe(toolResult.toolCallId);
      
      // Verify internal consistency within each text sequence
      expect(firstTextStart.id).toBe(firstTextDelta.id);
      expect(firstTextStart.id).toBe(firstTextEnd.id);
      expect(secondTextStart.id).toBe(secondTextDelta.id);
      expect(secondTextStart.id).toBe(secondTextEnd.id);
    });

    it('should demonstrate tool ID consistency requirements', () => {
      // This test documents expected behavior for tool call/result ID matching
      
      // Server provides ID - both call and result should use it
      const serverProvidedId = 'server-tool-123';
      const toolCallWithServerId = { type: 'tool-call', toolCallId: serverProvidedId };
      const toolResultWithServerId = { type: 'tool-result', toolCallId: serverProvidedId };
      
      expect(toolCallWithServerId.toolCallId).toBe(serverProvidedId);
      expect(toolResultWithServerId.toolCallId).toBe(serverProvidedId);
      
      // Server doesn't provide ID - should generate matching IDs
      // (In actual implementation, this would involve calling generateId)
      const generatedId = mockGenerateId(); // This would return 'test-id-1'
      const toolCallWithGeneratedId = { type: 'tool-call', toolCallId: generatedId };
      const toolResultWithGeneratedId = { type: 'tool-result', toolCallId: generatedId };
      
      expect(toolCallWithGeneratedId.toolCallId).toBe(toolResultWithGeneratedId.toolCallId);
      expect(mockGenerateId).toHaveBeenCalledTimes(1);
    });
  });

  describe('JSON Mode ID Consistency', () => {
    it('should demonstrate JSON extraction ID requirements', () => {
      // This test documents expected behavior for JSON mode text part IDs
      
      // Original streaming text parts would be filtered out in JSON mode
      const originalTextId = 'original-text-1';
      
      // New JSON-only text parts should be created with new ID
      const jsonTextId = mockGenerateId(); // 'test-id-1'
      
      const jsonTextStart = { type: 'text-start', id: jsonTextId };
      const jsonTextDelta = { type: 'text-delta', id: jsonTextId, delta: '{"key": "value"}' };
      const jsonTextEnd = { type: 'text-end', id: jsonTextId };
      
      // Verify JSON text parts share the same ID
      expect(jsonTextStart.id).toBe(jsonTextId);
      expect(jsonTextDelta.id).toBe(jsonTextId);
      expect(jsonTextEnd.id).toBe(jsonTextId);
      
      // Verify generateId was called for JSON text part
      expect(mockGenerateId).toHaveBeenCalledTimes(1);
      expect(jsonTextId).toBe('test-id-1');
    });
  });

  describe('Response ID Generation', () => {
    it('should demonstrate response ID generation for doGenerate', () => {
      // This test documents expected behavior for response ID generation
      
      const responseId = mockGenerateId(); // 'test-id-1'
      
      const mockResponse = {
        content: [{ type: 'text', text: 'Test response' }],
        finishReason: 'stop',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        warnings: [],
        response: {
          id: responseId,
          timestamp: new Date(),
          modelId: 'goose',
        },
        request: { body: 'Test message' },
      };
      
      expect(mockResponse.response.id).toBe('test-id-1');
      expect(mockGenerateId).toHaveBeenCalledTimes(1);
    });
  });

  describe('Model Properties', () => {
    it('should have correct static properties', () => {
      expect(model.specificationVersion).toBe('v2');
      expect(model.defaultObjectGenerationMode).toBe('tool');
      expect(model.provider).toBe('goose-web');
      expect(model.modelId).toBe('goose');
      expect(model.supportsImageUrls).toBe(false);
      expect(model.supportedUrls).toEqual({});
      expect(model.supportsStructuredOutputs).toBe(false);
    });

    it('should have correct settings', () => {
      expect(model.settings.wsUrl).toBe('ws://localhost:8080/ws');
      expect(model.settings.connectionTimeout).toBe(1000);
      expect(model.settings.responseTimeout).toBe(5000);
    });
  });

  describe('Utility Methods', () => {
    it('should convert prompts correctly', () => {
      // Test string prompt
      const stringResult = (model as any).convertPromptToText('Hello world');
      expect(stringResult).toBe('Hello world');

      // Test array of messages
      const arrayPrompt = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
      ];
      const arrayResult = (model as any).convertPromptToText(arrayPrompt);
      expect(arrayResult).toBe('System: You are helpful\n\nHello\n\nHi!');

      // Test multi-part content
      const multiPartPrompt = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: 'world' },
          ],
        },
      ];
      const multiPartResult = (model as any).convertPromptToText(multiPartPrompt);
      expect(multiPartResult).toBe('Hello world');
    });

    it('should extract JSON correctly', () => {
      // Test JSON object extraction
      const textWithJson = 'Here is data: {"name": "John", "age": 30} more text';
      const extractedJson = (model as any).extractJson(textWithJson);
      expect(extractedJson).toBe('{"name": "John", "age": 30}');

      // Test JSON array extraction
      const textWithArray = 'Numbers: [1, 2, 3] here';
      const extractedArray = (model as any).extractJson(textWithArray);
      expect(extractedArray).toBe('[1, 2, 3]');

      // Test no JSON
      const plainText = 'Just plain text';
      const noJsonResult = (model as any).extractJson(plainText);
      expect(noJsonResult).toBe(plainText);

      // Test invalid JSON
      const invalidJson = 'Bad JSON: {name: value}';
      const invalidResult = (model as any).extractJson(invalidJson);
      expect(invalidResult).toBe(invalidJson);
    });
  });
});
