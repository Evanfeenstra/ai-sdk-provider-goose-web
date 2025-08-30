import type { LanguageModelV2, ProviderV2 } from "@ai-sdk/provider";
import { NoSuchModelError } from "@ai-sdk/provider";
import {
  GooseWebLanguageModel,
  type GooseWebModelId,
} from "./goose-web-language-model.js";
import type { GooseWebSettings } from "./types.js";

/**
 * Goose Web provider interface that extends the AI SDK's ProviderV2.
 * Provides methods to create language models for interacting with Goose via WebSocket.
 *
 * @example
 * ```typescript
 * import { gooseWeb } from 'ai-sdk-provider-goose-web';
 *
 * // Create a model instance
 * const model = gooseWeb('goose');
 *
 * // Or use the explicit methods
 * const chatModel = gooseWeb.chat('goose');
 * const languageModel = gooseWeb.languageModel('goose', { wsUrl: 'ws://localhost:8080/ws' });
 * ```
 */
export interface GooseWebProvider extends ProviderV2 {
  /**
   * Creates a language model instance for the specified model ID.
   * This is a shorthand for calling `languageModel()`.
   *
   * @param modelId - The Goose model to use (typically 'goose')
   * @param settings - Optional settings to configure the model
   * @returns A language model instance
   */
  (modelId: GooseWebModelId, settings?: GooseWebSettings): LanguageModelV2;

  /**
   * Creates a language model instance for text generation.
   *
   * @param modelId - The Goose model to use (typically 'goose')
   * @param settings - Optional settings to configure the model
   * @returns A language model instance
   */
  languageModel(
    modelId: GooseWebModelId,
    settings?: GooseWebSettings
  ): LanguageModelV2;

  /**
   * Alias for `languageModel()` to maintain compatibility with AI SDK patterns.
   *
   * @param modelId - The Goose model to use (typically 'goose')
   * @param settings - Optional settings to configure the model
   * @returns A language model instance
   */
  chat(modelId: GooseWebModelId, settings?: GooseWebSettings): LanguageModelV2;

  /**
   * Text embedding models are not supported by Goose Web.
   * @throws Always throws an error
   */
  textEmbeddingModel(modelId: string): never;

  /**
   * Image models are not supported by Goose Web.
   * @throws Always throws an error
   */
  imageModel(modelId: string): never;
}

/**
 * Configuration settings for the Goose Web provider.
 */
export interface GooseWebProviderSettings extends GooseWebSettings {
  // Add any provider-level settings here if needed
}

/**
 * Creates a new Goose Web provider instance.
 *
 * @param settings - Optional provider-level configuration
 * @returns A new Goose Web provider instance
 *
 * @example
 * ```typescript
 * import { createGooseWeb } from 'ai-sdk-provider-goose-web';
 *
 * const provider = createGooseWeb({
 *   wsUrl: 'ws://localhost:8080/ws',
 *   sessionId: 'my-session'
 * });
 *
 * const model = provider('goose');
 * ```
 */
export function createGooseWeb(
  settings: GooseWebProviderSettings = {}
): GooseWebProvider {
  const createModel = (
    modelId: GooseWebModelId,
    modelSettings?: GooseWebSettings
  ): LanguageModelV2 => {
    // Validate model ID
    if (modelId !== "goose" && typeof modelId !== "string") {
      throw new NoSuchModelError({
        modelId: String(modelId),
        modelType: "languageModel",
      });
    }

    // Merge provider and model settings
    const mergedSettings: GooseWebSettings = {
      ...settings,
      ...modelSettings,
    };

    return new GooseWebLanguageModel({
      id: modelId,
      settings: mergedSettings,
    });
  };

  const provider = Object.assign(createModel, {
    languageModel: createModel,
    chat: createModel,
    textEmbeddingModel: (modelId: string): never => {
      throw new NoSuchModelError({ modelId, modelType: "textEmbeddingModel" });
    },
    imageModel: (modelId: string): never => {
      throw new NoSuchModelError({ modelId, modelType: "imageModel" });
    },
  });

  return provider;
}

/**
 * Default Goose Web provider instance.
 * This is a convenience export that creates a provider with default settings.
 *
 * @example
 * ```typescript
 * import { gooseWeb } from 'ai-sdk-provider-goose-web';
 *
 * const model = gooseWeb('goose');
 * ```
 */
export const gooseWeb = createGooseWeb();
