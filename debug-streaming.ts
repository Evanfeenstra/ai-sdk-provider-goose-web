import { gooseWeb } from "./src/index.js";
import { streamText } from "ai";

async function debugStreamingExample() {
  console.log("=== Debug Streaming Example ===");

  const model = gooseWeb("goose", {
    wsUrl: "ws://localhost:8080/ws",
    logger: {
      debug: (msg, ...args) => console.log(`[DEBUG] ${msg}`, ...args),
      info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
      warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
      error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
    },
  });

  try {
    console.log("Creating streamText...");
    const result = streamText({
      model,
      prompt: "Hello! Please tell me about WebSockets in a single sentence.",
    });

    console.log("Starting to read stream...");

    // Debug: Log all stream parts
    let partCount = 0;
    for await (const part of result.fullStream) {
      partCount++;
      console.log(`[STREAM PART ${partCount}] Type: ${part.type}`, part);

      if (part.type === "text-delta") {
        process.stdout.write(`[DELTA: "${part.text}"]`);
      }
    }

    console.log(`\n\nTotal stream parts: ${partCount}`);
    console.log("Final text:", await result.text);
    console.log("Final usage:", await result.usage);
    console.log("Finish reason:", await result.finishReason);
  } catch (error) {
    console.error("Error:", error);
  }
}

debugStreamingExample().catch(console.error);
