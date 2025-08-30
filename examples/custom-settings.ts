import { gooseWeb } from "../src/index.js";
import { generateText } from "ai";

export async function customSettingsExample() {
  console.log("=== Custom Settings Example ===");

  const model = gooseWeb("goose", {
    wsUrl: "ws://localhost:8080/ws",
    sessionId: "custom-session",
    connectionTimeout: 15000,
    responseTimeout: 60000,
  });

  try {
    const result = await generateText({
      model,
      prompt: "What is the difference between TCP and UDP?",
    });

    console.log("Generated text:", result.text);
  } catch (error) {
    console.error("Error:", error);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  customSettingsExample().catch(console.error);
}