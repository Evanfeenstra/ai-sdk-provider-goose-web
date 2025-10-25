/**
 * Configuration settings for the Goose Web provider.
 */
export interface GooseWebSettings {
  /**
   * The WebSocket URL to connect to the Goose server.
   * @default 'ws://localhost:8080/ws'
   */
  wsUrl?: string;

  /**
   * Session ID to use for the Goose session.
   * If not provided, a new session will be created.
   */
  sessionId?: string;

  /**
   * Connection timeout in milliseconds.
   * @default 30000
   */
  connectionTimeout?: number;

  /**
   * Response timeout in milliseconds.
   * @default 120000
   */
  responseTimeout?: number;

  /**
   * Logger instance for debugging and monitoring.
   */
  logger?: Logger;

  /**
   * Callback function that is called when a session is created.
   * Receives the session ID as a parameter.
   */
  sessionIdCallback?: (sessionId: string) => void;
}

/**
 * Logger interface for debugging and monitoring Goose Web operations.
 */
export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

/**
 * WebSocket message types sent to the Goose server.
 */
export interface GooseWebMessage {
  type: "message" | "cancel";
  content?: string;
  session_id: string;
  timestamp?: number;
}

/**
 * WebSocket message types received from the Goose server.
 */
export interface GooseWebResponse {
  type:
    | "response"
    | "tool_request"
    | "tool_response"
    | "thinking"
    | "complete"
    | "error"
    | "cancelled";
  id?: string;
  content?: string;
  role?: "assistant" | "user";
  timestamp?: number;
  message?: string;
  tool_name?: string;
  arguments?: any;
  result?: any;
  is_error?: boolean;
}
