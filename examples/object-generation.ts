import { gooseWeb } from "../src/index.js";
import { generateObject } from "ai";
import { z } from "zod";

export async function objectGenerationExample() {
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

if (import.meta.url === `file://${process.argv[1]}`) {
  objectGenerationExample().catch(console.error);
}