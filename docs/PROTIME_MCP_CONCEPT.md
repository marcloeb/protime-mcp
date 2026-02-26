# Protime MCP Server — Concept & Implementation Plan

**Date**: 2026-02-26
**Status**: Phase 2 Complete — Local testing working, deployment pending
**Author**: Marc Loeb + Claude
**Repo**: [github.com/marcloeb/protime-mcp](https://github.com/marcloeb/protime-mcp) (renamed from `openai-app-sdk`)

---

## 1. Vision

One Protime MCP server that plugs into every AI platform and messaging channel:

```
                         Protime MCP Server
                     (protime-mcp repo on Cloud Run)
                              |
        ┌─────────────┬──────┴──────┬─────────────┐
        |             |             |             |
   Claude Cowork   ChatGPT     OpenClaw Gateway   Direct API
   (plugin)        (App SDK)   (self-hosted)      (developers)
                                    |
                    ┌───────┬───────┼───────┬──────────┐
                    |       |       |       |          |
                WhatsApp Telegram Slack  iMessage   Discord
```

**Core idea**: Build the MCP server once. It exposes Protime's capabilities as standardized tools. Any AI agent — Claude, ChatGPT, or a self-hosted OpenClaw instance — can call these tools. OpenClaw handles the messaging platform adapters so Protime doesn't have to build WhatsApp/Telegram bots from scratch.

---

## 2. Existing Codebase — What We Already Have

The `protime-mcp` repo (formerly `openai-app-sdk`) already contains significant scaffolding:

### Already Built

| Component | Status | Location |
|-----------|--------|----------|
| Express server with MCP structure | Done | `src/index.ts` |
| 11 tool definitions | Done | `src/tools/index.ts` |
| Tool router with Zod validation | Done | `src/handlers/toolRouter.ts` |
| Briefing CRUD handlers | Done | `src/handlers/briefings.ts` |
| Edition retrieval handlers | Done | `src/handlers/editions.ts` |
| Source suggestion handlers | Done | `src/handlers/sources.ts` |
| Discovery flow (3-step) | Done | `src/handlers/discovery.ts` |
| Auth middleware (JWT-based) | Scaffold | `src/middleware/auth.ts` |
| Rate limiting | Done | `src/middleware/rateLimit.ts` |
| OAuth endpoints | Scaffold | `src/index.ts` (routes exist, exchange is TODO) |
| OAuth discovery metadata | Done | `/.well-known/oauth-authorization-server` |
| MCP manifest endpoint | Done | `/manifest` |
| Zod schemas for all tools | Done | `src/schemas/tools.ts` |
| Winston logger | Done | `src/utils/logger.ts` |
| Error handling (AppError) | Done | `src/utils/errors.ts` |
| TypeScript types | Done | `src/types/` |
| Dockerfile | Done | `Dockerfile` |
| Cloud Run deploy scripts | Done | `package.json` (staging + production) |
| Cloud Build config | Done | `cloudbuild.yaml` |

### Existing Tools (11 total)

**Discovery Flow (ChatGPT onboarding — 3 tools):**
1. `discover_topics` — multi-round topic refinement (0-3 levels)
2. `discover_sources` — auto-discover newsletters, RSS, YouTube, Google Search
3. `create_briefing_from_discovery` — create briefing from discovery session

**Briefing Management (5 tools):**
4. `create_briefing` — create from topic string
5. `get_briefings` — list all user briefings
6. `get_briefing_config` — detailed briefing configuration
7. `update_briefing` — modify settings, sources, schedule
8. `delete_briefing` — permanently delete

**Content Retrieval (2 tools):**
9. `get_editions` — list past briefing editions
10. `get_edition_content` — read full edition with summaries

**Source Discovery (1 tool):**
11. `suggest_sources` — get newsletter/RSS recommendations for a topic

### What's Missing (Updated 2026-02-26)

| Component | Status | Phase |
|-----------|--------|-------|
| MCP SDK stdio transport | **DONE** | Phase 1 |
| MCP SDK Streamable HTTP transport | **DONE** | Phase 1 |
| `get_briefing_summary` tool | **DONE** | Phase 1 |
| `search_briefing_content` tool | **DONE** | Phase 1 |
| `chat_with_content` tool | **DONE** | Phase 1 |
| Firebase Admin connection (real Firestore queries) | **DONE** | Phase 2 |
| OAuth 2.0 with PKCE (complete flow) | **DONE** | Phase 2 |
| MCP Resources (4 resources) | **DONE** | Phase 2 |
| Claude Desktop config example | **DONE** | Phase 2 |
| Firestore subcollection fix (real data model) | **DONE** | Phase 2 |
| Deploy to Cloud Run | **DONE** | Phase 2b |
| Custom domain `mcp.protime.ai` | **DONE** | Phase 2b |
| Protime OAuth consent page in mnl-front | **DONE** | Phase 2b |
| Rate limiting per user tier | TODO | Phase 2b |
| ChatGPT / Cowork marketplace submission | TODO | Phase 2b |
| User-facing docs at protime.ai/integrations | TODO | Phase 2b |
| `give_feedback` tool | TODO | Phase 3 |
| OpenClaw messaging gateway | TODO | Phase 3 |

---

## 3. Architecture

### Three Layers

#### Layer 1: Protime MCP Server (`protime-mcp` repo)
Node.js/TypeScript service on Cloud Run implementing the MCP protocol. Already has Express, tool definitions, handlers, auth middleware, and deploy scripts.

**Transports implemented:**
- **Stdio** — for local Claude Desktop / Claude Code integration (Phase 1, working)
- **Streamable HTTP** — for remote clients (OpenClaw, ChatGPT, web) (Phase 1, working)
- **Express HTTP** — backwards-compatible ChatGPT App SDK routes (preserved)

#### Layer 2: AI Platform Integrations (MCP consumers)
- **Claude Cowork** — registers Protime MCP as a connector in the marketplace
- **ChatGPT** — existing Express endpoints already designed for this
- **Claude Desktop** — users add MCP server to their local config via stdio
- **Claude Code** — developers use Protime tools while coding

#### Layer 3: OpenClaw Gateway (messaging bridge)
Self-hosted OpenClaw instance that:
- Connects to WhatsApp, Telegram, Slack, Discord, iMessage
- Routes user messages to an AI agent (Claude or GPT)
- Agent uses Protime MCP to fulfill requests
- Responses flow back to the messaging platform

```
User on WhatsApp: "What's in my briefing today?"
    -> WhatsApp adapter (Baileys) -> OpenClaw Gateway
    -> AI Agent (Claude API) -> calls Protime MCP tool: get_briefing_summary
    -> Protime MCP -> Firestore -> returns briefing summary
    -> AI formats response -> OpenClaw -> WhatsApp -> User
```

---

## 4. MCP Server — Tool Design

### 4.1 Tools Already Implemented (11 tools)

See section 2 above. These cover the full briefing lifecycle: discover -> create -> read -> update -> delete.

### 4.2 New Tools Needed (Phase 1)

#### `get_briefing_summary`
Optimized for messaging — concise, formatted for chat apps.
```typescript
{
  name: "get_briefing_summary",
  description: "Get a short executive summary of today's briefing, suitable for chat messages",
  inputSchema: {
    type: "object",
    properties: {
      briefingId: { type: "string" },
      format: { type: "string", enum: ["short", "detailed", "bullets"] }
    },
    required: ["briefingId"]
  }
}
```

#### `search_briefing_content`
Search across all briefing content by keyword or topic.
```typescript
{
  name: "search_briefing_content",
  description: "Search across briefing articles by keyword, topic, or question",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      briefingId: { type: "string", description: "Optional: limit to one briefing" },
      dateRange: { type: "object", properties: {
        from: { type: "string" },
        to: { type: "string" }
      }}
    },
    required: ["query"]
  }
}
```

#### `chat_with_content`
Ask questions about briefing content — proxies to existing mnl-front chatWithContent API.
```typescript
{
  name: "chat_with_content",
  description: "Ask a question about a specific briefing article or the entire briefing",
  inputSchema: {
    type: "object",
    properties: {
      briefingId: { type: "string" },
      issueId: { type: "string", description: "Optional: specific article" },
      question: { type: "string" }
    },
    required: ["briefingId", "question"]
  }
}
```

### 4.3 New Tools (Phase 3)

#### `give_feedback`
Rate or provide feedback on briefing content.
```typescript
{
  name: "give_feedback",
  description: "Rate a briefing article as helpful or not helpful",
  inputSchema: {
    type: "object",
    properties: {
      briefingId: { type: "string" },
      issueId: { type: "string" },
      articleId: { type: "string" },
      rating: { type: "string", enum: ["helpful", "not_helpful"] },
      comment: { type: "string" }
    },
    required: ["briefingId", "issueId", "articleId", "rating"]
  }
}
```

### 4.4 Resources (MCP Resources — IMPLEMENTED)

MCP Resources provide read-only data the AI can access without calling tools. All 4 resources are implemented in `src/server.ts`:

```typescript
// User's briefing list (static resource)
"protime://briefings"              // Returns all briefings with id, topic, schedule, active status, source count

// Specific briefing metadata (resource template with {briefingId})
"protime://briefings/{briefingId}" // Returns detailed config: topic, schedule, sources, categories, stats

// Latest edition content (resource template with {briefingId})
"protime://briefings/{briefingId}/latest"  // Returns most recent edition with full article content

// User profile (static resource)
"protime://profile"                // Returns id, email, displayName, tier, createdAt
```

Note: `protime://usage` was planned but deferred — usage tracking will be added when rate limiting is implemented.

---

## 5. Authentication Strategy

### The Challenge
MCP tools need to know **which user** is calling. Different platforms handle auth differently.

### Solution: OAuth 2.0 Everywhere — IMPLEMENTED

Complete OAuth 2.0 with PKCE implemented in `src/index.ts` (Phase 2). One auth system serves all platforms.

#### For Claude Desktop / Claude Code (WORKING)
- **Stdio mode** with env-based user identity (`STDIO_USER_ID`, `STDIO_USER_EMAIL`, `STDIO_USER_TIER`)
- Requires service account key for Firestore access
- Configured via `.mcp.json` (project-level) or `claude mcp add` (user-level)
- Example config: `examples/claude_desktop_config.json`

#### For ChatGPT / Claude Cowork / Remote Clients (IMPLEMENTED, deployment pending)
- **OAuth 2.0 authorization_code flow with PKCE (S256)**
- Full flow: `/auth/login` → Protime consent → `/auth/callback` → `/auth/token`
- Authorization codes stored in Firestore `oauthCodes` collection (10-min TTL)
- JWT access tokens (7-day expiry) via `createJWT()`
- Refresh tokens in Firestore `oauthRefreshTokens` (30-day expiry with rotation)
- PKCE validation: `SHA256(code_verifier) == stored_code_challenge`
- OAuth discovery metadata at `/.well-known/oauth-authorization-server`
- Batch revocation via `/auth/logout`

#### For Claude Cowork
- **OAuth 2.0 flow**: Same infrastructure as ChatGPT
- Register as Cowork connector in marketplace (pending deployment)

#### For OpenClaw (messaging platforms)
- **Device pairing**: User links their Protime account to their phone number / Telegram ID
- One-time setup: send a magic link or code via Protime web app
- OpenClaw stores the mapping: `whatsapp:+41796194314 -> protime:user_abc123`
- Every message from that number automatically authenticates

### Auth Flow Diagram

```
Claude Desktop / Claude Code:
  Option A: OAuth via localhost redirect -> Token stored in mcp.json
  Option B: API key at protime.ai/settings/api -> Copied to mcp.json

ChatGPT (scaffolded):
  User installs Protime action -> OAuth flow -> Token stored by OpenAI

Claude Cowork:
  User clicks "Connect Protime" -> OAuth redirect -> Protime login -> Token issued

OpenClaw/WhatsApp/Telegram:
  User opens protime.ai/connect -> Enters phone number -> Receives code on WhatsApp
  -> Replies with code -> Account linked -> All future messages authenticated
```

---

## 6. OpenClaw Integration — Messaging Platforms

### Why OpenClaw Instead of Custom Bots

Building WhatsApp/Telegram/Slack bots from scratch requires:
- Platform-specific SDKs and auth flows
- Message formatting per platform
- Media handling, rate limiting, session management
- Maintenance as APIs change

OpenClaw (231k GitHub stars, MIT license, TypeScript) provides all of this. Protime only needs to:
1. Build the MCP server (largely done)
2. Deploy an OpenClaw instance
3. Configure it to use Protime MCP
4. Users connect their messaging apps

### OpenClaw Configuration for Protime

```jsonc
// ~/.openclaw/openclaw.json
{
  "gateway": {
    "port": 18789,
    "auth": { "token": "..." }
  },
  "channels": {
    "whatsapp": {
      "enabled": true,
      "allowList": ["*"],
      "pairingMode": "qr"
    },
    "telegram": {
      "enabled": true,
      "botToken": "BOT_TOKEN_HERE"
    },
    "slack": {
      "enabled": true,
      "appToken": "..."
    }
  },
  "agents": {
    "default": {
      "model": "claude-sonnet-4-6",
      "mcpServers": {
        "protime": {
          "url": "https://mcp.protime.ai/sse",
          "apiKey": "${PROTIME_MCP_API_KEY}"
        }
      }
    }
  }
}
```

### Agent Personality (SOUL.md for OpenClaw)

```markdown
# Protime AI Assistant

You are Protime's AI assistant. You help users manage their briefings
and stay informed through messaging.

## Core behaviors:
- When users ask "what's new" or "briefing" -> call get_briefing_summary
- When users ask about a specific topic -> call search_briefing_content
- When users want to add topics -> call discover_topics
- When users ask questions about an article -> call chat_with_content
- Keep responses concise — this is a messaging app, not an essay

## Tone:
- Professional but conversational
- Brief — 2-3 sentences max for summaries
- Use bullet points for lists
- Link to full articles when relevant
```

### User Interaction Examples

```
WhatsApp:
User: "briefing"
AI: Your Protime briefing for Feb 26:

  *AI & ML* (3 articles)
  - OpenAI launches GPT-5 Turbo with 2M context
  - EU AI Act enforcement begins March 1
  - Anthropic acquires startup for $200M

  *SaaS* (2 articles)
  - Stripe raises prices for EU merchants
  - HubSpot adds AI writing assistant

  Reply with a number (1-5) for details, or ask me anything.

User: "1"
AI: *OpenAI launches GPT-5 Turbo*
  OpenAI released GPT-5 Turbo with a 2M token context window,
  4x faster inference, and native tool use. Pricing starts at...
  [Read full article]

User: "find me newsletters about quantum computing"
AI: Found 4 newsletters on quantum computing:
  1. Quantum Daily — weekly, 50k subscribers
  2. QC Report — biweekly, academic focus
  3. ...
  Add to your briefing? Reply "add 1" or "add all"
```

---

## 7. Implementation Plan (Adjusted for Existing Code)

### Phase 1: MCP Server Core (Weeks 1-2) — COMPLETED 2026-02-26

**Goal**: Working MCP server with all tools, dual transport, clean TypeScript build.

**Commit**: `8e3cbc7` — Phase 1: MCP server with 14 tools, dual transport (stdio + HTTP)

#### What Was Built
- [x] Updated `@modelcontextprotocol/sdk` to v1.27.1 (supports protocol versions up to `2025-11-25`)
- [x] `src/server.ts` — MCP server factory using official SDK with 14 tools registered via Zod schemas
- [x] `src/index.ts` — Dual transport: `--stdio` for Claude Desktop/Code, Streamable HTTP for remote clients
- [x] Session-per-user pattern: each HTTP session gets its own McpServer with authenticated user via closure
- [x] Logger routes all output to stderr in stdio mode (prevents JSON-RPC protocol corruption)
- [x] Exported `adminAuth` from firebase.ts for discovery handlers
- [x] Added `firebaseUid` to User type, fixed discovery handlers for optional field
- [x] 3 new tools: `get_briefing_summary`, `search_briefing_content`, `chat_with_content`
- [x] TypeScript compiles cleanly (0 errors)
- [x] MCP initialize handshake verified (stdio + protocol negotiation)
- [x] All 14 tools verified via `tools/list`

#### Key Files Created/Modified
| File | Change |
|------|--------|
| `src/server.ts` | NEW — MCP server factory (830 lines) |
| `src/index.ts` | REWRITTEN — dual transport entry point (520 lines) |
| `src/utils/logger.ts` | MODIFIED — stderr routing for stdio mode |
| `src/api/firebase.ts` | MODIFIED — export adminAuth |
| `src/types/user.ts` | MODIFIED — added firebaseUid |
| `src/handlers/discovery.ts` | MODIFIED — firebaseUid fallback to user.id |
| `package.json` | MODIFIED — SDK v1.27.1, sorted deps |

#### What Remains (Moved to Phase 2)
- OAuth token exchange still mocked (returns hardcoded tokens)
- Protime consent page in mnl-front not yet built
- Not deployed to Cloud Run yet
- No Claude Desktop config example

---

### Phase 2: OAuth + Resources + Claude Desktop — COMPLETED 2026-02-26

**Goal**: Complete OAuth flow, add MCP Resources, fix Firestore data model, create Claude Desktop config, test end-to-end.

**Commit**: `21f8f52` — Phase 2: OAuth flow, MCP Resources, Firestore subcollection fix, Claude Desktop config

#### What Was Built
- [x] Complete OAuth 2.0 authorization_code flow with PKCE (S256) in `src/index.ts`
- [x] PKCE code verifier validation (`SHA256(code_verifier) == stored_code_challenge`)
- [x] Authorization code storage in Firestore `oauthCodes` collection (10-min TTL)
- [x] Refresh token support with rotation in Firestore `oauthRefreshTokens` (30-day expiry)
- [x] JWT access tokens via `createJWT()` (7-day expiry)
- [x] Batch token revocation via `/auth/logout`
- [x] Map external user (Firebase ID token or userId) → Protime user in Firestore
- [x] Claude Desktop config example (`examples/claude_desktop_config.json`)
- [x] `.env.example` updated with STDIO_USER_ID/EMAIL/TIER vars
- [x] `.mcp.json` added to `.gitignore` (contains credentials)
- [x] 4 MCP Resources implemented in `src/server.ts`:
  - [x] `protime://briefings` — list all user briefings
  - [x] `protime://briefings/{briefingId}` — detailed briefing config (ResourceTemplate)
  - [x] `protime://briefings/{briefingId}/latest` — latest edition content (ResourceTemplate)
  - [x] `protime://profile` — user profile and tier
- [x] **Critical fix**: Firestore subcollection model — handlers rewritten to use `users/{userId}/briefings/{briefingId}` instead of top-level `briefings` collection
- [x] **Critical fix**: Field name mapping — `title` (not `topic`), `archived` (not `active`), `settings.schedule.frequency` (not `schedule`)
- [x] **Critical fix**: `firebase.ts` — replaced `await import()` with `readFileSync` for JSON (Node.js 22 ESM fix)
- [x] Added `userBriefings(userId)` and `userEditions(userId, briefingId)` subcollection helpers
- [x] End-to-end tested: Claude Code → stdio → MCP → Firestore → 3 real briefings returned

#### Key Files Created/Modified
| File | Change |
|------|--------|
| `src/index.ts` | REWRITTEN — full OAuth flow (login, callback, token, logout, revocation) |
| `src/server.ts` | MODIFIED — added 4 MCP Resources with ResourceTemplate |
| `src/api/firebase.ts` | MODIFIED — readFileSync fix, userBriefings/userEditions helpers |
| `src/handlers/briefings.ts` | REWRITTEN — subcollection paths, real field mapping |
| `src/handlers/editions.ts` | REWRITTEN — subcollection paths, field mapping |
| `examples/claude_desktop_config.json` | NEW — example stdio config |
| `.env.example` | MODIFIED — stdio vars, OAUTH_CALLBACK_URL |
| `.gitignore` | MODIFIED — added .mcp.json |

---

### Phase 2b: Deploy + Marketplace (Weeks 3-5) — TODO

**Goal**: Deploy to Cloud Run, submit to marketplaces, build consent page.

- [ ] Deploy to Cloud Run staging (`npm run deploy:staging`)
- [ ] Configure custom domain: `mcp.protime.ai`
- [ ] Test HTTP transport end-to-end: remote client → Bearer auth → MCP → response
- [ ] Build Protime OAuth consent page in mnl-front (`/[locale]/auth/connect`)
- [ ] Rate limiting per user tier (free: 50 calls/day, pro: 500, business: 5000)
- [ ] Usage tracking: log MCP tool calls per user for analytics
- [ ] Deploy to Cloud Run production (`npm run deploy:production`)
- [ ] Test full OAuth flow: ChatGPT → consent → token → tool call
- [ ] Submit to ChatGPT App Store
- [ ] Package for Anthropic Cowork marketplace (Streamable HTTP transport)
- [ ] Submit to Cowork marketplace
- [ ] Write user-facing docs: `protime.ai/integrations`

**Deliverable**: Protime deployed on Cloud Run, works with all remote AI platforms, submitted to marketplaces.

---

### Phase 3: Messaging via OpenClaw (Weeks 6-9)

**Goal**: Users interact with Protime via WhatsApp and Telegram.

#### Week 6: OpenClaw Setup
- [ ] Deploy OpenClaw instance on Cloud Run (`min-instances=1` for persistent connections)
- [ ] Configure Protime MCP as tool source via SSE (internal Cloud Run networking)
- [ ] Write SOUL.md (agent personality for messaging)
- [ ] Test with WebChat (browser-based, no phone needed)

#### Week 7: WhatsApp Integration
- [ ] Set up WhatsApp Business API or Baileys via OpenClaw
- [ ] Build account linking flow (magic link -> phone number mapping)
- [ ] Implement message formatting for WhatsApp (bold, lists, links)
- [ ] Beta test with 5-10 users

#### Week 8: Telegram Integration
- [ ] Create Telegram bot via BotFather
- [ ] Configure OpenClaw Telegram adapter
- [ ] Test bot commands: /briefing, /search, /discover
- [ ] Inline keyboard for article selection

#### Week 9: Polish & Launch
- [ ] Add Slack integration (native MCP support)
- [ ] Rate limiting and abuse prevention
- [ ] Landing page: protime.ai/integrations
- [ ] Announcement: blog post + LinkedIn

**Deliverable**: Protime works on WhatsApp, Telegram, Slack.

---

### Phase 4: Scale + Feedback Loop (Weeks 10-12)

#### Week 10-11: Feedback + Analytics
- [ ] Implement `give_feedback` tool
- [ ] Analytics dashboard: which platforms, which tools, usage patterns
- [ ] A/B test messaging formats (short vs detailed briefings)

#### Week 12: Productization
- [ ] Multi-tenant OpenClaw deployment (shared instance or per-org)
- [ ] Pricing review: MCP calls as part of subscription or separate tier
- [ ] Security audit: token scoping, rate limits, data access controls
- [ ] iMessage integration (macOS-only via OpenClaw)

---

## 8. Project Structure (After Phase 2)

```
protime-mcp/                        # github.com/marcloeb/protime-mcp
├── src/
│   ├── index.ts                    # Dual transport entry point (stdio + HTTP)
│   │                               #   - --stdio mode: Claude Desktop/Code
│   │                               #   - HTTP mode: Express + Streamable HTTP MCP
│   │                               #   - Complete OAuth 2.0 with PKCE
│   │                               #   - Manifest, health check
│   ├── server.ts                   # MCP server factory (14 tools + 4 resources)
│   │                               #   - 14 tools via Zod schemas
│   │                               #   - 4 MCP Resources (protime:// URIs)
│   ├── tools/
│   │   └── index.ts                # Legacy 11 tool definitions (Express compat)
│   ├── handlers/
│   │   ├── toolRouter.ts           # Express tool router (backwards compat)
│   │   ├── briefings.ts            # CRUD via Firestore subcollections
│   │   ├── editions.ts             # getEditions, getEditionContent via subcollections
│   │   ├── sources.ts              # suggestSources (curated categories)
│   │   └── discovery.ts            # 3-step: discoverTopics, discoverSources, createBriefing
│   ├── api/
│   │   └── firebase.ts             # Firebase Admin SDK + subcollection helpers
│   │                               #   - userBriefings(userId)
│   │                               #   - userEditions(userId, briefingId)
│   ├── schemas/
│   │   └── tools.ts                # Zod validation schemas
│   ├── types/
│   │   ├── mcp.ts                  # Legacy MCPServer class (kept for compat)
│   │   ├── briefing.ts             # Briefing, Edition, Source interfaces
│   │   └── user.ts                 # User interface (with firebaseUid)
│   ├── utils/
│   │   ├── logger.ts               # Winston logger (stderr in stdio mode)
│   │   └── errors.ts               # AppError, AuthenticationError, etc.
│   └── middleware/
│       ├── auth.ts                 # requireAuth (JWT + Firebase token), createJWT
│       └── rateLimit.ts            # Express rate limiter (api, auth, per-user)
├── examples/
│   └── claude_desktop_config.json  # Example stdio config for Claude Desktop
├── dist/                           # Compiled JS output
├── tests/
│   ├── schemas.test.ts             # Zod schema validation tests
│   └── handlers.test.ts            # Handler business logic tests
├── Dockerfile                      # Cloud Run (node:20-alpine, port 8080)
├── cloudbuild.yaml                 # Google Cloud Build
├── deploy.sh                       # Deployment script
├── .env.example                    # Environment variables (incl. stdio + OAuth vars)
├── .mcp.json                       # Local MCP config (gitignored, contains credentials)
├── package.json                    # @modelcontextprotocol/sdk v1.27.1
└── tsconfig.json
```

---

## 9. Access Modes — Who Can Use the MCP Server

Three distinct access modes serve different user types:

### Mode 1: Stdio (Developers / Internal)
**How it works**: Claude Desktop or Claude Code starts the MCP server as a local subprocess. Communication happens over stdin/stdout using JSON-RPC.

**Requirements**:
- Service account key (`serviceAccountKey.json`) for Firestore access
- User identity via environment variables: `STDIO_USER_ID`, `STDIO_USER_EMAIL`, `STDIO_USER_TIER`
- Node.js installed locally

**Config example** (`.mcp.json` or `claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "protime": {
      "command": "node",
      "args": ["dist/index.js", "--stdio"],
      "env": {
        "STDIO_USER_ID": "user-firebase-uid",
        "STDIO_USER_EMAIL": "user@example.com",
        "STDIO_USER_TIER": "pro",
        "FIREBASE_SERVICE_ACCOUNT_KEY_PATH": "/path/to/serviceAccountKey.json"
      }
    }
  }
}
```

**Who uses this**: Protime developers, power users with service account access.

### Mode 2: HTTP / Cloud Run (All Users via OAuth)
**How it works**: MCP server deployed to Cloud Run at `mcp.protime.ai`. Remote clients (ChatGPT, Claude Cowork, custom apps) connect via Streamable HTTP transport with OAuth 2.0 Bearer tokens.

**Requirements**:
- Deployed to Cloud Run (Phase 2b)
- User authenticates via OAuth 2.0 with PKCE
- No local setup needed — everything runs in the cloud

**Flow**: Client → OAuth login → Protime consent → Token issued → MCP tool calls with Bearer token

**Who uses this**: All Protime users on ChatGPT, Claude Cowork, or custom integrations.

### Mode 3: Messaging via OpenClaw (Phase 3)
**How it works**: OpenClaw gateway connects messaging platforms (WhatsApp, Telegram, Slack) to an AI agent that uses the Protime MCP server as a tool source.

**Requirements**:
- OpenClaw instance deployed on Cloud Run
- User links their messaging account to Protime (one-time device pairing)

**Who uses this**: End users who want briefings on WhatsApp/Telegram.

---

## 10. Deployment Architecture

```
┌───────────────────────────────────────────────────────────┐
│                  Google Cloud Platform (protime-summi)     │
│                                                           │
│  ┌─────────────────┐   ┌───────────────────────────────┐  │
│  │  Cloud Run       │   │  Cloud Run                    │  │
│  │  protime-mcp     │   │  openclaw-gateway              │  │
│  │  (EXISTING)      │   │  (min-instances=1)             │  │
│  │  - MCP Protocol  │<--│  - WhatsApp adapter (Baileys)  │  │
│  │  - HTTP + SSE    │   │  - Telegram adapter (grammY)   │  │
│  │  - OAuth 2.0     │   │  - Slack adapter (Bolt)        │  │
│  │                  │   │  - Claude API agent            │  │
│  └────────┬─────────┘   └───────────────────────────────┘  │
│           │                                                │
│           v                                                │
│  ┌─────────────────┐   ┌──────────────────────────┐       │
│  │  Firestore       │   │  Existing Cloud Functions │       │
│  │  (shared DB)     │<--│  (discovery, schedules)   │       │
│  └──────────────────┘   └──────────────────────────┘       │
└────────────────────────────────────────────────────────────┘
         ^                        ^
         |                        |
    Claude Cowork            ChatGPT Actions
    Claude Desktop           (existing Express routes)
    Claude Code
```

**Cost estimate:**
- Cloud Run (MCP server): ~EUR5-15/month (scales to zero, deploy scripts ready)
- Cloud Run (OpenClaw): ~EUR20-50/month (min-instances=1 for persistent WhatsApp connection)

---

## 11. Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Repo | `protime-mcp` (existing, renamed from `openai-app-sdk`) | Already has 70% of the code |
| Auth | Full OAuth 2.0 from day one | Scaffolding already exists, needed for all platforms anyway — build it right |
| OpenClaw hosting | Cloud Run (same GCP project) | Unified infra, same billing, internal networking to Firestore. Use `min-instances=1` for persistent WhatsApp/Telegram connections |
| Data exposure | Read-only first, writes in Phase 2+ | Safe, no side effects |
| Pricing | **Tiered: Business paid / AI platforms free / Messaging free** | See pricing model below |

### Pricing Model

| Channel | Price | Rationale |
|---------|-------|-----------|
| **MCP API for Business** (direct API access, custom integrations) | Paid (part of Pro/Business subscription) | Revenue channel — companies integrating Protime into their workflows |
| **Claude Cowork / Claude Desktop** | Free | Distribution channel — puts Protime in front of enterprise teams |
| **ChatGPT** | Free | Distribution channel — 800M+ users, drives signups |
| **WhatsApp / Telegram / Slack / Messaging** | Free | Retention channel — daily touchpoint keeps users engaged, builds habit |

**Strategy**: AI platforms and messaging are **growth engines**, not revenue streams. They drive signups (ChatGPT/Claude) and retention (WhatsApp/Telegram). Revenue comes from the core Protime subscription. Businesses that want direct API access or custom integrations pay for the Business tier.

---

## 12. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| WhatsApp blocks bot number | High | Use WhatsApp Business API (official), not grey-area Baileys |
| Cloud Run cold starts for OpenClaw | Medium | `min-instances=1` keeps one instance warm (~EUR20-50/month) |
| OpenClaw maintenance burden | Medium | OpenClaw is actively maintained (231k stars), large community |
| Low adoption of MCP tools | Medium | Free on all AI platforms drives adoption; messaging drives retention |
| OAuth complexity | ~~Medium~~ **Resolved** | Full OAuth 2.0 with PKCE implemented and tested |
| Protime API rate limits | Low | Both Cloud Run services in same GCP project, internal networking |
| Data exposure via MCP | Medium | Scope tokens per user, never expose other users' data |
| Free tier abuse | Medium | Rate limit free channels; messaging tied to verified phone numbers |
| Existing code staleness | ~~Low~~ **Resolved** | Codebase fully modernized with MCP SDK v1.27.1 and real Firestore queries |

---

## 13. Success Metrics

| Metric | Phase 1 (Week 2) | Phase 2 (Week 5) | Phase 3 (Week 9) |
|--------|-------------------|-------------------|-------------------|
| MCP server deployed | Yes | Yes | Yes |
| Claude Desktop users | 10 | 20 | 50 |
| ChatGPT action installs | -- | 50 | 100 |
| Cowork connector live | -- | Yes | Yes |
| WhatsApp active users | -- | -- | 50 |
| Telegram active users | -- | -- | 30 |
| Daily MCP tool calls | 50 | 200 | 500 |

---

## 14. Competitive Advantage

This creates a moat that general-purpose AI tools cannot replicate:

1. **Protime MCP has domain knowledge** — it knows your sources, your categories, your reading patterns
2. **Pre-curated content** — unlike asking ChatGPT to "search the web", Protime already has your personalized briefing ready
3. **Multi-platform presence** — same AI assistant on Claude, ChatGPT, WhatsApp, Telegram
4. **Zero-effort delivery** — briefing arrives automatically, MCP tools provide on-demand access to the same content
5. **Network effect** — shared briefings become discoverable across platforms

The AI platforms are the highways. Protime is the truck that runs on all of them, delivering personalized content that no general-purpose AI can match.
