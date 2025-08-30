import { gooseWeb } from "../src/index.js";
import { streamText } from "ai";

export async function streamingExample() {
  console.log("=== Streaming Text Generation ===");

  const model = gooseWeb("goose", {
    wsUrl: "ws://localhost:8080/ws",
  });

  try {
    const result = streamText({
      model,
      prompt: "Hello! Please tell me about WebSockets in only 1 sentence.",
    });

    console.log("Streaming response:");
    for await (const textPart of result.textStream) {
      process.stdout.write(textPart);
    }
    console.log("\n");

    console.log("Final usage:", await result.usage);
    console.log("Finish reason:", await result.finishReason);
  } catch (error) {
    console.error("Error:", error);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  streamingExample().catch(console.error);
}