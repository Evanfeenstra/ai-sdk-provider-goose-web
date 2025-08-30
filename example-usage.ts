import { gooseWeb } from './src/index.js';
import { generateText, streamText } from 'ai';

async function basicExample() {
  console.log('=== Basic Text Generation ===');
  
  const model = gooseWeb('goose', {
    wsUrl: 'ws://localhost:8080/ws',
    sessionId: 'example-session',
  });

  try {
    const result = await generateText({
      model,
      prompt: 'Hello! Can you help me write a simple Python function to calculate the factorial of a number?',
    });

    console.log('Generated text:', result.text);
    console.log('Usage:', result.usage);
  } catch (error) {
    console.error('Error:', error);
  }
}

async function streamingExample() {
  console.log('=== Streaming Text Generation ===');
  
  const model = gooseWeb('goose', {
    wsUrl: 'ws://localhost:8080/ws',
  });

  try {
    const result = streamText({
      model,
      prompt: 'Explain how WebSockets work in simple terms.',
    });

    for await (const textPart of result.textStream) {
      process.stdout.write(textPart);
    }
    console.log('\n');
    
    console.log('Final usage:', await result.usage);
  } catch (error) {
    console.error('Error:', error);
  }
}

async function customSettingsExample() {
  console.log('=== Custom Settings Example ===');
  
  const model = gooseWeb('goose', {
    wsUrl: 'ws://localhost:8080/ws',
    sessionId: 'custom-session',
    connectionTimeout: 15000,
    responseTimeout: 60000,
    logger: {
      debug: (msg, ...args) => console.log(`[DEBUG] ${msg}`, ...args),
      info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
      warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
      error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
    }
  });

  try {
    const result = await generateText({
      model,
      prompt: 'What is the difference between TCP and UDP?',
    });

    console.log('Generated text:', result.text);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run examples
async function main() {
  console.log('Goose Web AI SDK Provider Examples\n');
  
  await basicExample();
  console.log('\n' + '='.repeat(50) + '\n');
  
  await streamingExample();
  console.log('\n' + '='.repeat(50) + '\n');
  
  await customSettingsExample();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}