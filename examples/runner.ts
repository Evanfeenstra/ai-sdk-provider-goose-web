import { basicExample } from "./basic.js";
import { streamingExample } from "./streaming.js";
import { streamingWithToolsExample } from "./streaming-tools.js";
import { objectGenerationExample } from "./object-generation.js";
import { streamObjectExample } from "./stream-object.js";
import { customSettingsExample } from "./custom-settings.js";
import { debugStreamingExample } from "./debug.js";

const examples = {
  basic: basicExample,
  streaming: streamingExample,
  "streaming-tools": streamingWithToolsExample,
  "object-generation": objectGenerationExample,
  "stream-object": streamObjectExample,
  "custom-settings": customSettingsExample,
  debug: debugStreamingExample,
};

async function main() {
  const exampleName = process.argv[2] || "basic";
  const example = examples[exampleName as keyof typeof examples];
  
  if (!example) {
    console.log(`Example "${exampleName}" not found. Available examples:`);
    Object.keys(examples).forEach((name) => {
      console.log(`  - ${name}`);
    });
    process.exit(1);
  }
  
  console.log(`Running ${exampleName} example...\n`);
  await example();
}

main().catch(console.error);