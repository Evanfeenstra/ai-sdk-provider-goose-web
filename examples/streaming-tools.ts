import { gooseWeb } from "../src/index.js";
import { streamText } from "ai";

export async function streamingWithToolsExample() {
  console.log("=== Streaming with Tool Calls ===");

  const model = gooseWeb("goose", {
    wsUrl: "ws://localhost:8080/ws",
  });

  try {
    const result = streamText({
      model,
      prompt: "Read the streaming-notes.md file and summarize its contents.",
    });

    console.log("Streaming with tools:");

    // Listen to all stream events
    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta":
          process.stdout.write(part.text);
          break;
        case "tool-call":
          console.log(`\n[TOOL CALL] ${part.toolName}: ${part.input}`);
          break;
        case "tool-result":
          console.log(`[TOOL RESULT] ${part.output}`);
          break;
        case "finish":
          console.log(`\n[FINISHED] Reason: ${part.finishReason}`);
          break;
      }
    }

    console.log("\nFinal text:", await result.text);
  } catch (error) {
    console.error("Error:", error);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  streamingWithToolsExample().catch(console.error);
}