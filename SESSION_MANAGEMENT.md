# Session Management

## Overview

The Goose Web backend requires sessions to exist before WebSocket messages can be processed. This provider now automatically creates sessions via the Goose REST API before opening WebSocket connections.

## How It Works

### Backend Session Creation Flow

When you visit the Goose web UI:
1. GET `/` → Backend creates session via `SessionManager::create_session()`
2. Backend redirects to `/session/{id}` with 307 status
3. JavaScript extracts `{id}` from URL and uses it for WebSocket connection

### Provider Session Creation Flow

The provider now replicates this flow:

1. **Before opening WebSocket**: Call `ensureSession()`
2. **If no sessionId provided**:
   - HTTP GET to base URL (derived from wsUrl)
   - Capture redirect `Location` header
   - Extract session ID from `/session/{id}` pattern
3. **Use extracted session ID** for WebSocket connection

## Changes Made

### New Method: `ensureSession()`

```typescript
private async ensureSession(): Promise<void> {
  if (this.sessionCreated && this.sessionId) {
    return;
  }

  // If sessionId provided in settings, assume it exists
  if (this.settings.sessionId) {
    this.sessionId = this.settings.sessionId;
    this.sessionCreated = true;
    return;
  }

  // Create session via REST API
  const httpUrl = this.settings.wsUrl!
    .replace(/^wss?:\/\//, "http://")
    .replace(/\/ws$/, "");

  const response = await fetch(httpUrl, {
    method: "GET",
    redirect: "manual", // Capture redirect without following
  });

  // Extract session ID from Location: /session/{id}
  const location = response.headers.get("location");
  if (location && location.startsWith("/session/")) {
    this.sessionId = location.replace("/session/", "");
    this.sessionCreated = true;
  }
}
```

### Modified Constructor

```typescript
constructor(options: GooseWebLanguageModelOptions) {
  // ...
  this.sessionId = this.settings.sessionId || ""; // Empty until created
  this.sessionCreated = false;
}
```

### Called Before WebSocket Operations

Both `doGenerate()` and `doStream()` now call `ensureSession()` before creating WebSocket:

```typescript
async doGenerate(options) {
  await this.ensureSession(); // NEW: Ensure session exists
  const ws = await this.createWebSocket();
  // ...
}

async doStream(options) {
  await this.ensureSession(); // NEW: Ensure session exists
  const ws = await this.createWebSocket();
  // ...
}
```

## Usage

### Before (Required Pre-existing Session)

```typescript
const model = gooseWeb("goose", {
  wsUrl: "ws://localhost:8080/ws",
  sessionId: "20251025_1", // Must exist in Goose backend!
});
```

### After (Auto-creates Session)

```typescript
// Option 1: Let provider create session automatically
const model = gooseWeb("goose", {
  wsUrl: "ws://localhost:8080/ws",
  // No sessionId needed - will be created automatically
});

// Option 2: Still works with explicit sessionId
const model = gooseWeb("goose", {
  wsUrl: "ws://localhost:8080/ws",
  sessionId: "existing-session-id", // Assumes this exists
});
```

## Debugging

Enable logger to see session creation:

```typescript
const model = gooseWeb("goose", {
  wsUrl: "ws://localhost:8080/ws",
  logger: {
    debug: (msg, ...args) => console.log(`[DEBUG] ${msg}`, ...args),
    info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  },
});
```

Expected logs:
```
[DEBUG] Creating session via REST API { httpUrl: 'http://localhost:8080' }
[DEBUG] Session created { sessionId: '20251025_1' }
[DEBUG] WebSocket connected { wsUrl: 'ws://localhost:8080/ws' }
[DEBUG] Sent message to Goose server { type: 'message', content: '...', session_id: '20251025_1' }
```

## Error Handling

If session creation fails:
- Throws `ConnectionError` with details
- Check that Goose server is running and accessible
- Verify wsUrl is correct (should point to Goose web server)

## Backend Requirements

**No changes required to Goose backend!**

The provider uses the existing Goose REST API endpoint (`GET /`) which already:
- Creates sessions via `SessionManager::create_session()`
- Returns 307 redirect to `/session/{id}`
- Session persists in SQLite database for WebSocket connections

## Session Lifecycle

1. **First Request**: Provider calls `GET /` → Session created → ID extracted
2. **Subsequent Requests**: Same session ID reused (cached in provider instance)
3. **Session Persistence**: Sessions persist in Goose's SQLite database across WebSocket reconnections
4. **Session Reuse**: If you want to reuse a session across multiple provider instances, pass `sessionId` explicitly

## Migration Guide

### If you were manually creating sessions:

**Before:**
```typescript
// 1. Visit http://localhost:8080/ in browser to create session
// 2. Copy session ID from URL
// 3. Use in code:
const model = gooseWeb("goose", {
  sessionId: "20251025_1", // Manually obtained
});
```

**After:**
```typescript
// Just create the model - session handled automatically
const model = gooseWeb("goose", {
  wsUrl: "ws://localhost:8080/ws",
});
```

### If you were getting "FOREIGN KEY constraint failed" errors:

This error occurred when using a non-existent session ID. The auto-creation feature fixes this by ensuring sessions exist before WebSocket connections.

## Local Development with Hive

When developing and testing changes to ai-sdk-provider-goose-web with the Hive project, you need to link the local package.

### Option 1: npm link (Recommended for Development)

**In ai-sdk-provider-goose-web:**
```bash
cd /Users/evanfeenstra/code/evanf/ai-sdk-provider-goose-web
npm run build
npm link
```

**In Hive:**
```bash
cd /Users/evanfeenstra/code/sphinx2/hive
npm link ai-sdk-provider-goose-web
```

**After making changes to provider:**
```bash
# In ai-sdk-provider-goose-web
npm run build

# Hive will automatically pick up the changes
# Just restart your Next.js dev server (Ctrl+C and npm run dev)
```

**To unlink later:**
```bash
cd /Users/evanfeenstra/code/sphinx2/hive
npm unlink ai-sdk-provider-goose-web
npm install
```

### Option 2: Direct File Path (Alternative)

Edit `package.json` in Hive:
```json
{
  "dependencies": {
    "ai-sdk-provider-goose-web": "file:../evanf/ai-sdk-provider-goose-web"
  }
}
```

Then:
```bash
cd /Users/evanfeenstra/code/sphinx2/hive
npm install
```

After provider changes:
```bash
# In ai-sdk-provider-goose-web
npm run build

# In Hive
rm -rf node_modules/ai-sdk-provider-goose-web
npm install
# Restart Next.js dev server
```

### Option 3: Watch Mode (Best for Active Development)

**Terminal 1 - Provider (watch mode):**
```bash
cd /Users/evanfeenstra/code/evanf/ai-sdk-provider-goose-web
npm run dev  # Runs tsup --watch
```

**Terminal 2 - Hive:**
```bash
cd /Users/evanfeenstra/code/sphinx2/hive
npm link ai-sdk-provider-goose-web  # If not already linked
npm run dev
```

Now changes to the provider automatically rebuild, and you just need to refresh/retry in Hive.

### Verifying Local Package is Used

Check which version is installed:
```bash
cd /Users/evanfeenstra/code/sphinx2/hive
npm ls ai-sdk-provider-goose-web
```

Should show:
```
ai-sdk-provider-goose-web@0.1.2 -> ./../evanf/ai-sdk-provider-goose-web
```

Or check the symlink directly:
```bash
ls -la node_modules/ai-sdk-provider-goose-web
```

### Testing the Changes

1. **Start Goose backend:**
```bash
cd /Users/evanfeenstra/code/evanf/goose
cargo run --release -p goose-cli -- web --host 0.0.0.0 --port 8888
```

2. **Start Hive:**
```bash
cd /Users/evanfeenstra/code/sphinx2/hive
npm run dev
```

3. **Test the agent route:**
- Visit your task page with agent enabled
- Send a message
- Check console logs for session creation:
```
🔍 [Goose Debug] Creating session via REST API
🔍 [Goose Debug] Session created { sessionId: '20251025_1' }
🔍 [Goose Debug] WebSocket connected
```

### Common Issues

**Issue: Changes not reflecting**
- Solution: Rebuild provider (`npm run build`) and restart Next.js dev server

**Issue: Module not found**
- Solution: Re-run `npm link ai-sdk-provider-goose-web` in Hive directory

**Issue: Old version still being used**
- Solution:
```bash
cd /Users/evanfeenstra/code/sphinx2/hive
rm -rf node_modules/ai-sdk-provider-goose-web
npm link ai-sdk-provider-goose-web
```

**Issue: TypeScript errors about missing types**
- Solution: Provider needs to be built (`npm run build`) to generate `.d.ts` files

### Debugging

Add detailed logging in Hive's agent route:
```typescript
const model = gooseWeb("goose", {
  wsUrl: process.env.CUSTOM_GOOSE_URL || "ws://0.0.0.0:8888/ws",
  sessionId, // Optional - leave out to test auto-creation
  logger: {
    debug: (message: string, ...args: unknown[]) => {
      console.log(`🔍 [Goose Debug] ${message}`, ...args);
    },
    info: (message: string, ...args: unknown[]) => {
      console.log(`ℹ️ [Goose Info] ${message}`, ...args);
    },
    warn: (message: string, ...args: unknown[]) => {
      console.warn(`⚠️ [Goose Warn] ${message}`, ...args);
    },
    error: (message: string, ...args: unknown[]) => {
      console.error(`❌ [Goose Error] ${message}`, ...args);
    },
  },
});
```

This will show all session creation and WebSocket communication in your Next.js console.
