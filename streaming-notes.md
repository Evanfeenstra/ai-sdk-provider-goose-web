# AI SDK Streaming Implementation Notes

This document explains the tricky aspects of implementing streaming for AI SDK providers, based on the experience building the Goose Web provider.

## The Challenge

The AI SDK expects providers to emit stream parts in a specific lifecycle pattern:
1. `text-start` - Registers a text part with an ID
2. `text-delta` - Adds content to the registered text part
3. `text-end` - Completes the text part

The challenge is that external streaming APIs (like Goose Web) don't necessarily follow this pattern. They might send:
- Raw text chunks without lifecycle events
- Different message types and formats
- Asynchronous WebSocket messages that need proper ordering

## Key Problems Encountered

### 1. Text Part Lifecycle Management

**Problem**: The AI SDK internally tracks active text parts. When you send a `text-delta`, it looks up the text part by ID. If no `text-start` was sent first, you get:
```
Error: text part [id] not found
```

**Solution**: Always ensure `text-start` is emitted and processed before any `text-delta` for the same ID.

```typescript
// Store text-start but don't emit immediately
if (part.type === 'text-start') {
  pendingTextStart = part;
  return;
}

// When first text-delta arrives, emit text-start first
if (part.type === 'text-delta' && pendingTextStart) {
  messageQueue.push(pendingTextStart);
  messageQueue.push(part);
  pendingTextStart = null;
  // Wake up generator...
}
```

### 2. Async Generator + WebSocket Race Conditions

**Problem**: WebSocket messages arrive asynchronously, but the AI SDK's async generator needs to yield them in the correct order. The generator might be waiting for the next item while multiple WebSocket messages queue up.

**Initial Broken Approach**:
```typescript
// BAD: Direct resolution loses subsequent messages
if (resolveNext) {
  resolveNext({ done: false, value: part });
  resolveNext = null; // Now subsequent parts have nowhere to go!
}
```

**Solution**: Use a consistent queue-based approach where all parts go through a message queue, and `resolveNext` just wakes up the generator:

```typescript
// GOOD: All parts go to queue, resolveNext just wakes up generator
messageQueue.push(part);

if (resolveNext) {
  const resolve = resolveNext;
  resolveNext = null;
  resolve({ done: false, value: null }); // Just wake up, don't pass value
}

// Generator processes queue in order
while (!finished || messageQueue.length > 0) {
  if (messageQueue.length > 0) {
    yield messageQueue.shift()!; // Process in order
  } else {
    await new Promise<void>((resolve) => {
      resolveNext = (result) => resolve(); // Just wake up
    });
  }
}
```

### 3. AI SDK Internal Transformations

**Problem**: The AI SDK internally transforms stream parts. What you emit as `{ type: 'text-delta', delta: 'hello' }` becomes `{ type: 'text-delta', text: 'hello' }` in the final stream.

**Why This Matters**: When debugging, you might see your `delta` field but the final stream shows a `text` field. This is expected behavior - the AI SDK processes and transforms parts internally.

**Key Insight**: Trust the AI SDK's processing. Focus on emitting correctly structured parts according to the TypeScript definitions, not what appears in the final stream.

## Implementation Pattern

### 1. WebSocket Message Handler
```typescript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'response':
      // First response chunk
      if (!textStartEmitted) {
        const textPartId = generateId();
        enqueueStreamPart({ type: 'text-start', id: textPartId });
        textStartEmitted = true;
      }
      enqueueStreamPart({ 
        type: 'text-delta', 
        id: textPartId, 
        delta: data.content 
      });
      break;
      
    case 'complete':
      enqueueStreamPart({ type: 'text-end', id: textPartId });
      enqueueStreamPart({ 
        type: 'finish', 
        finishReason: 'stop',
        usage: { inputTokens: 0, outputTokens: 0 }
      });
      finished = true;
      break;
  }
};
```

### 2. Queue-Based Stream Part Handler
```typescript
const enqueueStreamPart = (part: LanguageModelV2StreamPart) => {
  // Special case: text-start + text-delta ordering
  if (part.type === 'text-delta' && pendingTextStart) {
    messageQueue.push(pendingTextStart);
    messageQueue.push(part);
    pendingTextStart = null;
  } else {
    messageQueue.push(part);
  }
  
  // Wake up generator if waiting
  if (resolveNext) {
    const resolve = resolveNext;
    resolveNext = null;
    resolve({ done: false, value: null });
  }
};
```

### 3. Async Generator Loop
```typescript
async function* streamResponse(): AsyncGenerator<LanguageModelV2StreamPart> {
  // Process queue until finished and empty
  while (!finished || messageQueue.length > 0) {
    if (messageQueue.length > 0) {
      yield messageQueue.shift()!;
    } else {
      // Wait to be woken up
      await new Promise<void>((resolve) => {
        resolveNext = (result) => resolve();
      });
    }
  }
}
```

## Common Pitfalls

### 1. Don't Mix Direct Resolution with Queueing
Pick one approach and stick to it. Mixing direct resolution (`resolveNext(part)`) with queueing leads to race conditions.

### 2. Don't Forget Text Part Lifecycle
Every `text-delta` needs a corresponding `text-start` with the same ID, emitted first.

### 3. Don't Assume Stream Part Field Names
The AI SDK may transform your stream parts. Focus on the TypeScript interface, not the final output structure.

### 4. Handle Edge Cases
- What if WebSocket disconnects mid-stream?
- What if no content is received?
- What if multiple text parts need to be created?

## Debugging Tips

### 1. Add Debug Logging
```typescript
const enqueueStreamPart = (part: LanguageModelV2StreamPart) => {
  console.log('Enqueueing:', part.type, part);
  // ... rest of implementation
};
```

### 2. Monitor Both Sides
- Log what you emit: `{ type: 'text-delta', delta: 'hello' }`
- Log what the AI SDK processes: `{ type: 'text-delta', text: 'hello' }`

### 3. Count Stream Parts
Track how many parts you emit vs. how many the AI SDK processes. They should match.

### 4. Test Edge Cases
- Very short responses (single character)
- Very long responses (multiple chunks)
- Empty responses
- Error conditions

## Why This Approach Works

1. **Predictable Ordering**: Queue ensures parts are processed in the order they're received
2. **Proper Lifecycle**: text-start always precedes text-delta
3. **No Race Conditions**: Single point of truth (the queue) for all stream parts
4. **AI SDK Compatibility**: Follows the exact pattern the AI SDK expects
5. **Debuggable**: Clear separation between receiving, queueing, and yielding

## Future Provider Considerations

When building new AI SDK providers:

1. **Start with the queue approach** - It's more reliable than direct resolution
2. **Map your API to AI SDK stream parts** - Don't try to force AI SDK to match your API
3. **Test streaming thoroughly** - It's the most complex part of provider implementation
4. **Handle WebSocket/connection lifecycle** - Cleanup, reconnection, error states
5. **Follow TypeScript interfaces exactly** - The AI SDK is strict about stream part structure

The key insight is that streaming in AI SDK is about **lifecycle management**, not just data transfer. Get the lifecycle right, and the data will flow correctly.