import { gooseWeb } from "../src/index.js";
import { generateText } from "ai";

export async function basicExample() {
  console.log("=== Basic Text Generation ===");

  const model = gooseWeb("goose", {
    wsUrl: "ws://localhost:8080/ws",
    sessionId: "example-session",
  });

  try {
    const result = await generateText({
      model,
      prompt:
        "Hello! Can you help me write a simple Python function to calculate the factorial of a number?",
    });

    console.log("Generated text:", result.text);
    console.log("Usage:", result.usage);
  } catch (error) {
    console.error("Error:", error);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  basicExample().catch(console.error);
}