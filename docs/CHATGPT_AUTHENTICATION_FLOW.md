# ChatGPT Authentication Flow

This document explains how OpenAI ChatGPT handles authentication for MCP servers.

## Overview

ChatGPT acts as the **OAuth client** and handles the entire OAuth flow automatically. Your MCP server is the **resource server** that verifies tokens.

---

## User Experience in ChatGPT

### Step 1: Add MCP Server

User goes to ChatGPT:
```
Settings → Apps & Connectors → Create
├─ Name: "Protime Briefings"
├─ URL: https://protime-mcp-staging-xxx.a.run.app
└─ Authentication: OAuth 2.1
```

### Step 2: First Tool Use

User tries to create a briefing:
```
User: "Create a briefing about AI News"

ChatGPT: Detects tool needs authentication
         Shows popup: "Connect to Protime"
         
User: Clicks [Connect to Protime]

Browser opens: https://protime.ai/auth/chatgpt
User logs in with Firebase Auth
Protime redirects back to ChatGPT with code

ChatGPT: Exchanges code for access token
         Stores token securely
         
ChatGPT: Calls tool with token
POST /tools/create_briefing
Authorization: Bearer <access-token>
```

### Step 3: Subsequent Requests

```
User: "Show my briefings"

ChatGPT: Already has token, just sends it
POST /tools/get_briefings
Authorization: Bearer <access-token>
```

---

## What ChatGPT Does Automatically

ChatGPT handles all OAuth complexity:

✅ **Discovery**
- Fetches `/.well-known/oauth-authorization-server`
- Gets your authorization and token endpoints

✅ **Dynamic Client Registration (DCR)**
- Registers itself with your auth server
- Obtains `client_id` automatically

✅ **PKCE Flow (Proof Key for Code Exchange)**
- Generates `code_challenge` and `code_verifier`
- Secures authorization code exchange

✅ **Token Management**
- Exchanges authorization code for access token
- Stores tokens per user
- Attaches `Authorization: Bearer <token>` to every request
- Refreshes tokens when expired
- Re-prompts user if token invalid (401)

---

## What Your MCP Server Must Provide

### 1. OAuth Discovery Metadata ✅ (Added)

**Endpoint:** `GET /.well-known/oauth-authorization-server`

ChatGPT queries this first to discover your OAuth endpoints.

```json
{
  "issuer": "https://protime-mcp-staging-xxx.a.run.app",
  "authorization_endpoint": "https://protime-mcp-staging-xxx.a.run.app/auth/login",
  "token_endpoint": "https://protime-mcp-staging-xxx.a.run.app/auth/token",
  "scopes_supported": ["briefings:read", "briefings:write"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"]
}
```

**Status:** ✅ Implemented in `src/index.ts:119`

---

### 2. Authorization Endpoint ✅ (Exists)

**Endpoint:** `GET /auth/login`

Redirects user to Protime login page.

```typescript
// User arrives here from ChatGPT
GET /auth/login?
  redirect_uri=https://chatgpt.com/auth/callback
  &state=xyz
  &code_challenge=abc
  &code_challenge_method=S256

// Your server redirects to Protime login
Location: https://protime.ai/auth/chatgpt?callback=...
```

**Status:** ✅ Implemented in `src/index.ts:137`

---

### 3. Token Exchange Endpoint ⚠️ (TODO)

**Endpoint:** `POST /auth/token`

ChatGPT exchanges authorization code for access token.

**Current status:** Returns mock tokens (TODO at line 156)

**Request from ChatGPT:**
```json
POST /auth/token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "code": "xyz123",
  "redirect_uri": "https://chatgpt.com/auth/callback",
  "code_verifier": "abc456"
}
```

**Expected response:**
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 604800,
  "refresh_token": "def789",
  "scope": "briefings:read briefings:write"
}
```

**What you need to implement:**
1. Verify `code` with Firebase Auth or your auth system
2. Verify `code_verifier` matches `code_challenge` (PKCE)
3. Generate JWT access token
4. Return token to ChatGPT

**Status:** ⚠️ TODO - Currently returns mock response

---

### 4. Token Verification ✅ (Exists)

**Middleware:** `src/middleware/auth.ts`

Verifies every incoming request has valid token.

```typescript
// ChatGPT sends:
POST /tools/create_briefing
Authorization: Bearer eyJhbGc...

// Your middleware verifies:
- Token signature valid
- Token not expired
- User exists in Firestore
- Returns 401 if invalid → ChatGPT re-prompts user
```

**Status:** ✅ Fully implemented

---

## Authentication Flow Diagram

```
┌─────────┐           ┌──────────┐           ┌─────────┐
│ ChatGPT │           │   MCP    │           │ Protime │
│         │           │  Server  │           │   Web   │
└────┬────┘           └────┬─────┘           └────┬────┘
     │                     │                      │
     │ 1. Discover OAuth   │                      │
     ├────────────────────>│                      │
     │  GET /.well-known/  │                      │
     │  oauth-auth-server  │                      │
     │<────────────────────┤                      │
     │   {endpoints}        │                      │
     │                     │                      │
     │ 2. User clicks tool │                      │
     │ "Connect to Protime"│                      │
     │                     │                      │
     │ 3. Redirect to auth │                      │
     ├────────────────────>│                      │
     │  GET /auth/login    │                      │
     │                     │ 4. Redirect to login │
     │                     ├─────────────────────>│
     │                     │                      │
     │                     │  5. User logs in     │
     │                     │                      │
     │                     │ 6. Callback with code│
     │<─────────────────────────────────────────┤
     │  chatgpt.com/auth/  │                      │
     │  callback?code=xyz  │                      │
     │                     │                      │
     │ 7. Exchange code    │                      │
     ├────────────────────>│                      │
     │ POST /auth/token    │                      │
     │ {code, verifier}    │                      │
     │<────────────────────┤                      │
     │ {access_token}      │                      │
     │                     │                      │
     │ 8. Use tool with token                     │
     ├────────────────────>│                      │
     │ POST /tools/create  │                      │
     │ Authorization: Bearer│                     │
     │<────────────────────┤                      │
     │ {success: true}     │                      │
     │                     │                      │
```

---

## What You Need to Do

### Option A: Use Firebase Auth Tokens (Simpler, works now)

**User flow:**
1. User logs into protime.ai → Gets Firebase ID token
2. User copies token from Settings page
3. Adds MCP server to ChatGPT with token as "API Key"
4. ChatGPT sends `Authorization: Bearer <firebase-token>`
5. Your middleware verifies it → ✅ Works immediately!

**Pros:**
- ✅ No OAuth implementation needed
- ✅ Works today with existing code
- ✅ Uses your existing Firebase Auth

**Cons:**
- ⚠️ User must manually copy token
- ⚠️ Less seamless UX

---

### Option B: Implement Full OAuth (Better UX, more work)

**User flow:**
1. User clicks "Connect to Protime" in ChatGPT
2. Logs in at protime.ai (one time)
3. ChatGPT handles all tokens automatically
4. ✅ Seamless experience

**What you need:**
1. ✅ OAuth discovery endpoint (already added!)
2. ✅ Authorization endpoint (already exists!)
3. ⚠️ **Token exchange endpoint** (TODO - main work)
4. 🔧 **Protime web page**: `/auth/chatgpt` login page
5. 🔧 **Protime backend**: Generate authorization codes

---

## Recommendation

**For launch:** Start with **Option A** (Firebase tokens)
- Deploy now, works immediately
- Users can test while you build Option B

**For production:** Implement **Option B** (Full OAuth)
- Better user experience
- Standard OAuth flow
- Token refresh handling

---

## Testing OAuth Flow

### 1. Test Discovery Endpoint

```bash
curl https://protime-mcp-staging-xxx.a.run.app/.well-known/oauth-authorization-server
```

Expected:
```json
{
  "issuer": "https://protime-mcp-staging-xxx.a.run.app",
  "authorization_endpoint": "...",
  "token_endpoint": "..."
}
```

### 2. Test Authorization (Browser)

```
Open: https://protime-mcp-staging-xxx.a.run.app/auth/login?redirect_uri=http://localhost:3000/callback
Should redirect to: https://protime.ai/auth/chatgpt
```

### 3. Test Token Exchange

```bash
curl -X POST https://protime-mcp-staging-xxx.a.run.app/auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "test_code",
    "redirect_uri": "http://localhost:3000/callback"
  }'
```

Currently returns mock tokens. Implement real exchange for production.

---

## Environment Variables

Add to `.env`:

```bash
# Base URL for your MCP server
OAUTH_CALLBACK_URL=https://protime-mcp-staging-xxx.a.run.app/auth/callback

# JWT secret for signing access tokens
JWT_SECRET=$(openssl rand -base64 32)

# Token expiry (7 days recommended)
JWT_EXPIRY=7d
```

---

## Next Steps

1. ✅ OAuth discovery - **Done**
2. ✅ Authorization endpoint - **Done**
3. ⚠️ Token exchange - **TODO (main work)**
4. 🔧 Protime web `/auth/chatgpt` page - **Needs implementation**
5. 🔧 Protime backend auth code generation - **Needs implementation**
6. ✅ Token verification - **Done**

The server will run and work with Firebase tokens today. OAuth is ready except for token exchange implementation.
