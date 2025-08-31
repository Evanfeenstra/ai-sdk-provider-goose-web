# AI SDK Provider for Goose Web

An AI SDK v5 provider that connects to a remote Goose agent via WebSocket. The actual LLM used by Goose is configured by the `goose web` command on the server, not by this provider.

## Features

- 🔌 **WebSocket Connection**: Connect to Goose agent over WebSocket
- 📡 **Streaming Support**: Full streaming text generation with tool calls
- 🛠️ **Tool Calling**: Support for Goose's built-in tools and functions
- 📦 **Object Generation**: Generate structured objects with Zod schemas
- 🔄 **Session Management**: Maintain conversation context across requests
- ⚡ **TypeScript Support**: Fully typed with comprehensive TypeScript support

## Installation

```bash
npm install ai-sdk-provider-goose-web
```

## Usage Examples

First start goose in the directory you want to work with:

`goose web --port 8080`

### Basic Text Generation

```typescript
import { gooseWeb } from "ai-sdk-provider-goose-web";
import { generateText } from "ai";

const model = gooseWeb("goose", {
  wsUrl: "ws://localhost:8080/ws",
});

const result = await generateText({
  model,
  prompt: "Explain WebSockets in simple terms",
});
```

### Streaming Text

```typescript
import { streamText } from "ai";

const result = streamText({
  model,
  prompt: "Write a story about AI",
});

for await (const textPart of result.textStream) {
  process.stdout.write(textPart);
}
```

### Streaming with Tool Calls

```typescript
const result = streamText({
  model,
  prompt: "Read the repository and create a summary",
});

for await (const part of result.fullStream) {
  switch (part.type) {
    case "text-delta":
      process.stdout.write(part.text);
      break;
    case "tool-call":
      console.log(`Tool: ${part.toolName}`);
      break;
    case "tool-result":
      console.log(`Result: ${part.output}`);
      break;
  }
}
```

### Object Generation

```typescript
import { generateObject } from "ai";
import { z } from "zod";

const schema = z.object({
  name: z.string(),
  skills: z.array(z.string()),
  experience: z.number(),
});

const result = await generateObject({
  model,
  schema,
  prompt: "Generate a developer profile",
});

console.log(result.object);
```

## Configuration Options

```typescript
const model = gooseWeb("goose", {
  // WebSocket URL (required)
  wsUrl: "ws://localhost:8080/ws",

  // Session ID for conversation context
  sessionId: "my-session",

  // Connection timeout in milliseconds
  connectionTimeout: 10000,

  // Response timeout in milliseconds
  responseTimeout: 30000,

  // Custom logger for debugging
  logger: console,
});
```

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Run tests
npm test

# Run example
npm run example
```
