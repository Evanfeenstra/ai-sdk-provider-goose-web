/**
 * Provider exports for creating and configuring Goose Web instances.
 * @module goose-web
 */

/**
 * Creates a new Goose Web provider instance and the default provider instance.
 * @see {@link createGooseWeb} for creating custom provider instances
 * @see {@link gooseWeb} for the default provider instance
 */
export { createGooseWeb, gooseWeb } from "./goose-web-provider.js";

/**
 * Type definitions for the Goose Web provider.
 * @see {@link GooseWebProvider} for the provider interface
 * @see {@link GooseWebProviderSettings} for provider configuration options
 */
export type {
  GooseWebProvider,
  GooseWebProviderSettings,
} from "./goose-web-provider.js";

/**
 * Language model implementation for Goose Web.
 * This class implements the AI SDK's LanguageModelV2 interface.
 */
export { GooseWebLanguageModel } from "./goose-web-language-model.js";

/**
 * Standalone function to validate a Goose session.
 * Call this before creating a model to check if a session exists and get a valid session ID.
 *
 * @see {@link validateGooseSession} for session validation without creating a model instance
 */
export { validateGooseSession } from "./goose-web-language-model.js";

/**
 * Type definitions for Goose Web language models.
 * @see {@link GooseWebModelId} for supported model identifiers
 * @see {@link GooseWebLanguageModelOptions} for model configuration options
 */
export type {
  GooseWebModelId,
  GooseWebLanguageModelOptions,
} from "./goose-web-language-model.js";

/**
 * Settings for configuring Goose Web behavior.
 * Includes options for customizing the WebSocket connection, timeouts, and session management.
 */
export type {
  GooseWebSettings,
  Logger,
  GooseWebMessage,
  GooseWebResponse,
} from "./types.js";

/**
 * Error handling utilities for Goose Web.
 * These functions help create and identify specific error types.
 *
 * @see {@link isConnectionError} to check for connection failures
 * @see {@link isTimeoutError} to check for timeout errors
 * @see {@link getErrorMetadata} to extract error metadata
 * @see {@link createAPICallError} to create general API errors
 * @see {@link createConnectionError} to create connection errors
 * @see {@link createTimeoutError} to create timeout errors
 */
export {
  isConnectionError,
  isTimeoutError,
  getErrorMetadata,
  createAPICallError,
  createConnectionError,
  createTimeoutError,
} from "./errors.js";

/**
 * Metadata associated with Goose Web errors.
 * Contains additional context about WebSocket connection failures.
 */
export type { GooseWebErrorMetadata } from "./errors.js";
