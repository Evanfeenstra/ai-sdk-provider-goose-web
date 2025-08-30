import { APICallError } from "@ai-sdk/provider";

/**
 * Metadata associated with Goose Web errors.
 */
export interface GooseWebErrorMetadata {
  wsUrl?: string;
  sessionId?: string;
  lastMessage?: string;
  connectionState?: "connecting" | "connected" | "disconnected" | "error";
}

/**
 * Creates a general API call error for Goose Web operations.
 */
export function createAPICallError(
  message: string,
  metadata?: GooseWebErrorMetadata
): APICallError {
  return new APICallError({
    message,
    url: metadata?.wsUrl || "ws://unknown",
    requestBodyValues: metadata?.lastMessage
      ? { message: metadata.lastMessage }
      : undefined,
    data: metadata,
    isRetryable: false,
  });
}

/**
 * Creates a connection error for WebSocket failures.
 */
export function createConnectionError(
  message: string,
  metadata?: GooseWebErrorMetadata
): APICallError {
  return new APICallError({
    message: `Connection error: ${message}`,
    url: metadata?.wsUrl || "ws://unknown",
    requestBodyValues: metadata?.lastMessage
      ? { message: metadata.lastMessage }
      : undefined,
    data: metadata,
    isRetryable: true,
  });
}

/**
 * Creates a timeout error for Goose Web operations.
 */
export function createTimeoutError(
  timeoutMs: number,
  metadata?: GooseWebErrorMetadata
): APICallError {
  return new APICallError({
    message: `Request timed out after ${timeoutMs}ms`,
    url: metadata?.wsUrl || "ws://unknown",
    requestBodyValues: metadata?.lastMessage
      ? { message: metadata.lastMessage }
      : undefined,
    data: metadata,
    isRetryable: true,
  });
}

/**
 * Checks if an error is a connection error.
 */
export function isConnectionError(error: unknown): boolean {
  return (
    error instanceof APICallError && error.message.includes("Connection error")
  );
}

/**
 * Checks if an error is a timeout error.
 */
export function isTimeoutError(error: unknown): boolean {
  return error instanceof APICallError && error.message.includes("timed out");
}

/**
 * Gets error metadata from a Goose Web error.
 */
export function getErrorMetadata(error: unknown): GooseWebErrorMetadata | null {
  if (error instanceof APICallError && error.data) {
    return error.data as GooseWebErrorMetadata;
  }
  return null;
}
