import { describe, it, expect, vi, beforeEach } from "vitest";
import { GooseWebLanguageModel } from "./goose-web-language-model.js";
import type { GooseWebResponse } from "./types.js";

// Mock WebSocket implementation
const createMockWebSocket = () => {
  const mockWebSocket = {
    onopen: undefined as ((event: Event) => void) | undefined,
    onmessage: undefined as ((event: { data: string }) => void) | undefined,
    onclose: undefined as
      | ((event: { code: number; reason: string }) => void)
      | undefined,
    onerror: undefined as ((event: Event) => void) | undefined,
    url: "",

    send: vi.fn(),
    close: vi.fn(),

    // Helper methods for testing
    simulateMessage: (data: GooseWebResponse) => {
      if (mockWebSocket.onmessage) {
        mockWebSocket.onmessage({ data: JSON.stringify(data) });
      }
    },

    simulateOpen: () => {
      if (mockWebSocket.onopen) {
        mockWebSocket.onopen(new Event("open"));
      }
    },

    simulateClose: (code = 1000, reason = "") => {
      if (mockWebSocket.onclose) {
        mockWebSocket.onclose({ code, reason });
      }
    },

    simulateError: () => {
      if (mockWebSocket.onerror) {
        mockWebSocket.onerror(new Event("error"));
      }
    },
  };

  return mockWebSocket;
};

// Mock the ws module
vi.mock("ws", () => {
  return {
    default: vi.fn().mockImplementation((url: string) => {
      const mockWs = createMockWebSocket();
      mockWs.url = url;
      return mockWs;
    }),
  };
});

describe("GooseWebLanguageModel", () => {
  let model: GooseWebLanguageModel;

  beforeEach(() => {
    vi.clearAllMocks();

    model = new GooseWebLanguageModel({
      id: "goose",
      settings: {
        wsUrl: "ws://localhost:8080/ws",
        sessionId: "test-session",
        connectionTimeout: 1000,
        responseTimeout: 5000,
      },
    });
  });

  describe("constructor", () => {
    it("should create model with correct properties", () => {
      expect(model.modelId).toBe("goose");
      expect(model.provider).toBe("goose-web");
      expect(model.specificationVersion).toBe("v2");
      expect(model.defaultObjectGenerationMode).toBe("tool");
      expect(model.supportsImageUrls).toBe(false);
      expect(model.supportedUrls).toEqual({});
      expect(model.supportsStructuredOutputs).toBe(false);
    });
  });

  describe("convertPromptToText", () => {
    it("should handle string prompt", () => {
      const result = (model as any).convertPromptToText("Hello world");
      expect(result).toBe("Hello world");
    });

    it("should handle array of messages", () => {
      const prompt = [
        { role: "system", content: "You are a helpful assistant" },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];

      const result = (model as any).convertPromptToText(prompt);
      expect(result).toBe(
        "System: You are a helpful assistant\n\nHello\n\nHi there!"
      );
    });

    it("should handle multi-part content", () => {
      const prompt = [
        {
          role: "user",
          content: [
            { type: "text", text: "Hello" },
            { type: "text", text: "world" },
          ],
        },
      ];

      const result = (model as any).convertPromptToText(prompt);
      expect(result).toBe("Hello world");
    });

    it("should filter non-text parts", () => {
      const prompt = [
        {
          role: "user",
          content: [
            { type: "text", text: "Hello" },
            { type: "image", url: "http://example.com/image.jpg" },
            { type: "text", text: "world" },
          ],
        },
      ];

      const result = (model as any).convertPromptToText(prompt);
      expect(result).toBe("Hello world");
    });

    it("should handle empty or null prompts", () => {
      expect((model as any).convertPromptToText("")).toBe("");
      expect((model as any).convertPromptToText(null)).toBe("");
      expect((model as any).convertPromptToText(undefined)).toBe("");
    });
  });

  describe("extractJson", () => {
    it("should extract valid JSON object", () => {
      const text =
        'Here is the data: {"name": "John", "age": 30} and some more text';
      const result = (model as any).extractJson(text);
      expect(result).toBe('{"name": "John", "age": 30}');
    });

    it("should extract valid JSON array", () => {
      const text = "The list is [1, 2, 3] here";
      const result = (model as any).extractJson(text);
      expect(result).toBe("[1, 2, 3]");
    });

    it("should return original text if no valid JSON found", () => {
      const text = "This is just plain text without JSON";
      const result = (model as any).extractJson(text);
      expect(result).toBe(text);
    });

    it("should return original text if JSON is malformed", () => {
      const text = "Bad JSON: {name: John, age: 30}";
      const result = (model as any).extractJson(text);
      expect(result).toBe(text);
    });
  });
});
