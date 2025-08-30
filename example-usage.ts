import { gooseWeb } from "./src/index.js";
import { generateText, streamText, generateObject, streamObject } from "ai";
import { z } from "zod";

async function basicExample() {
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

async function streamingExample() {
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

async function streamingWithToolsExample() {
  console.log("=== Streaming with Tool Calls ===");

  const model = gooseWeb("goose", {
    wsUrl: "ws://localhost:8080/ws",
  });

  try {
    const result = streamText({
      model,
      prompt: "List the files in the current directory and tell me about them.",
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

async function objectGenerationExample() {
  console.log("=== Object Generation ===");

  const model = gooseWeb("goose", {
    wsUrl: "ws://localhost:8080/ws",
  });

  const schema = z.object({
    name: z.string().describe("Name of the person"),
    age: z.number().describe("Age in years"),
    occupation: z.string().describe("Job or profession"),
    skills: z.array(z.string()).describe("List of skills"),
  });

  try {
    const result = await generateObject({
      model,
      schema,
      prompt: "Generate a profile for a software developer named John.",
    });

    console.log("Generated object:", result.object);
    console.log("Usage:", result.usage);
  } catch (error) {
    console.error("Error:", error);
  }
}

async function streamObjectExample() {
  console.log("=== Streaming Object Generation ===");

  const model = gooseWeb("goose", {
    wsUrl: "ws://localhost:8080/ws",
  });

  const schema = z.object({
    tasks: z
      .array(
        z.object({
          id: z.number(),
          title: z.string(),
          completed: z.boolean(),
          priority: z.enum(["low", "medium", "high"]),
        })
      )
      .describe("List of tasks"),
    summary: z.string().describe("Summary of the task list"),
  });

  try {
    const result = streamObject({
      model,
      schema,
      prompt: "Generate a todo list with 5 tasks for a software project.",
    });

    console.log("Streaming object generation:");
    for await (const partialObject of result.partialObjectStream) {
      console.clear();
      console.log("Current object state:");
      console.log(JSON.stringify(partialObject, null, 2));
      await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay for demo
    }

    console.log("\nFinal object:", await result.object);
  } catch (error) {
    console.error("Error:", error);
  }
}

async function customSettingsExample() {
  console.log("=== Custom Settings Example ===");

  const model = gooseWeb("goose", {
    wsUrl: "ws://localhost:8080/ws",
    sessionId: "custom-session",
    connectionTimeout: 15000,
    responseTimeout: 60000,
    logger: {
      debug: (msg, ...args) => console.log(`[DEBUG] ${msg}`, ...args),
      info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
      warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
      error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
    },
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

// Run examples
async function main() {
  console.log("Goose Web AI SDK Provider Examples\n");

  // await basicExample();
  // console.log("\n" + "=".repeat(50) + "\n");

  await streamingExample();
  console.log("\n" + "=".repeat(50) + "\n");

  return;
  await streamingWithToolsExample();
  console.log("\n" + "=".repeat(50) + "\n");

  await objectGenerationExample();
  console.log("\n" + "=".repeat(50) + "\n");

  await streamObjectExample();
  console.log("\n" + "=".repeat(50) + "\n");

  await customSettingsExample();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
