import { describe, it, expect } from "vitest";
import * as GooseWebProvider from "./index.js";
import { GooseWebLanguageModel } from "./goose-web-language-model.js";

describe("GooseWebProvider Index", () => {
  it("should export all required functions and types", () => {
    // Check function exports
    expect(typeof GooseWebProvider.createGooseWeb).toBe("function");
    expect(typeof GooseWebProvider.gooseWeb).toBe("function");
    expect(typeof GooseWebProvider.GooseWebLanguageModel).toBe("function");

    // Check error handling exports
    expect(typeof GooseWebProvider.isConnectionError).toBe("function");
    expect(typeof GooseWebProvider.isTimeoutError).toBe("function");
    expect(typeof GooseWebProvider.getErrorMetadata).toBe("function");
    expect(typeof GooseWebProvider.createAPICallError).toBe("function");
    expect(typeof GooseWebProvider.createConnectionError).toBe("function");
    expect(typeof GooseWebProvider.createTimeoutError).toBe("function");
  });

  it("should create provider instance from default export", () => {
    const model = GooseWebProvider.gooseWeb("goose");
    expect(model.modelId).toBe("goose");
    expect(model.provider).toBe("goose-web");
  });

  it("should create custom provider instance", () => {
    const provider = GooseWebProvider.createGooseWeb({
      wsUrl: "ws://test:8080/ws",
      sessionId: "test-session",
    });

    const model = provider("goose") as GooseWebLanguageModel;
    expect(model.modelId).toBe("goose");
    expect(model.settings.wsUrl).toBe("ws://test:8080/ws");
    expect(model.settings.sessionId).toBe("test-session");
  });
});
