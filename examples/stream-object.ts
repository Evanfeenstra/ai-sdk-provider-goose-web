import { gooseWeb } from "../src/index.js";
import { streamObject } from "ai";
import { z } from "zod";

export async function streamObjectExample() {
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

if (import.meta.url === `file://${process.argv[1]}`) {
  streamObjectExample().catch(console.error);
}