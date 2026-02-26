# Protime MCP Server

Multi-platform MCP server that connects Protime's AI briefings to Claude, ChatGPT, and messaging platforms.

**Live**: https://mcp.protime.ai

## Architecture

```
                     Protime MCP Server
                   (Cloud Run + stdio)
                          |
      ┌──────────┬───────┴───────┬──────────┐
      |          |               |          |
 Claude Code  Claude Cowork   ChatGPT   OpenClaw
 (stdio)      (HTTP+OAuth)   (HTTP+OAuth) (Phase 3)
```

- **MCP Protocol**: `@modelcontextprotocol/sdk` v1.27.1
- **Transports**: stdio (local) + Streamable HTTP (remote)
- **Auth**: OAuth 2.0 with PKCE for remote clients, env vars for stdio
- **Data**: Firestore subcollections (`users/{uid}/briefings/{bid}/editions/{eid}`)
- **Deploy**: Cloud Run europe-west3, custom domain via Global LB

## 14 Tools

**Discovery (onboarding)**
1. `discover_topics` — multi-round topic refinement (0-3 levels)
2. `discover_sources` — auto-discover newsletters, RSS, YouTube, Google Search
3. `create_briefing_from_discovery` — create briefing from discovery session

**Briefing management**
4. `create_briefing` — quick-create by topic
5. `get_briefings` — list all briefings
6. `get_briefing_config` — detailed config (sources, schedule, stats)
7. `update_briefing` — modify sources, schedule, categories
8. `delete_briefing` — archive a briefing

**Content**
9. `get_editions` — list past editions
10. `get_edition_content` — full edition with summaries by category
11. `get_briefing_summary` — latest edition in short/detailed/bullets format

**Search & interactive**
12. `suggest_sources` — curated newsletter/RSS recommendations
13. `search_briefing_content` — keyword search across editions
14. `chat_with_content` — ask questions about edition content

## 4 MCP Resources

```
protime://briefings                        — list all briefings
protime://briefings/{briefingId}           — briefing config
protime://briefings/{briefingId}/latest    — latest edition content
protime://profile                          — user profile and tier
```

## Quick Start

### Claude Desktop / Claude Code (stdio)

Add to your MCP config (`.mcp.json` or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "protime": {
      "command": "node",
      "args": ["dist/index.js", "--stdio"],
      "cwd": "/path/to/protime-mcp",
      "env": {
        "STDIO_USER_ID": "your-firebase-uid",
        "STDIO_USER_EMAIL": "you@example.com",
        "STDIO_USER_TIER": "pro",
        "FIREBASE_PROJECT_ID": "protime-summi",
        "FIREBASE_SERVICE_ACCOUNT_KEY_PATH": "/path/to/serviceAccountKey.json"
      }
    }
  }
}
```

Or via CLI:
```bash
claude mcp add protime -s user -- node dist/index.js --stdio
```

### Remote clients (ChatGPT, Claude Cowork)

OAuth 2.0 flow via `https://mcp.protime.ai`:
- Discovery: `GET /.well-known/oauth-authorization-server`
- Login: `GET /auth/login` (with PKCE challenge)
- Token: `POST /auth/token` (exchange code for JWT)
- MCP: `POST /mcp` (with Bearer token)

## Development

```bash
npm install          # Install dependencies
npm run build        # Build with esbuild (instant)
npm run dev          # Dev server with hot reload (tsx)
npm run typecheck    # Type check only (needs 8GB heap, optional)
npm test             # Run tests
```

### Build

Uses **esbuild** instead of tsc for compilation. The MCP SDK's deep Zod type inference causes tsc to OOM. Type checking is available separately via `npm run typecheck`.

## Deployment

```bash
npm run deploy:staging     # Deploy to Cloud Run staging
npm run deploy:production  # Deploy to Cloud Run production
```

### Infrastructure

| Component | Details |
|-----------|---------|
| Cloud Run | `protime-mcp-staging` in europe-west3 |
| Custom domain | `mcp.protime.ai` via Global External HTTPS LB |
| SSL | Managed cert `cert-mcp-protime` (auto-renewed) |
| Secrets | `jwt-secret`, `session-secret` in Secret Manager |
| Artifact Registry | `protime-mcp` repo in europe-west3 |
| LB | `lb-api-protime` (shared with api.protime.ai) |
| NEG | `neg-protime-mcp` → Cloud Run service |
| Backend service | `bg-protime-mcp` on the LB |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_PROJECT_ID` | Yes | Firebase project (protime-summi) |
| `FIREBASE_SERVICE_ACCOUNT_KEY_PATH` | Stdio only | Path to service account JSON |
| `JWT_SECRET` | HTTP mode | Secret for signing JWT tokens |
| `SESSION_SECRET` | HTTP mode | Secret for session management |
| `OAUTH_CALLBACK_URL` | HTTP mode | OAuth callback URL |
| `STDIO_USER_ID` | Stdio only | Firebase UID for local user |
| `STDIO_USER_EMAIL` | Stdio only | Email for local user |
| `STDIO_USER_TIER` | Stdio only | Tier: free/pro/business |
| `PORT` | No | Server port (default 8080) |
| `NODE_ENV` | No | Environment (default development) |

## Auth

### Stdio mode (developers)
User identity from env vars. Requires service account key for Firestore access.

### HTTP mode (OAuth 2.0 with PKCE)
1. Client redirects to `/auth/login` with PKCE code_challenge
2. User authenticates at Protime (Firebase Auth)
3. Callback stores authorization code in Firestore (10-min TTL)
4. Client exchanges code + code_verifier for JWT access token (7d) + refresh token (30d)
5. Refresh tokens rotate on use, revocable via `/auth/logout`

## Project Structure

```
protime-mcp/
├── src/
│   ├── index.ts              # Dual transport (stdio + HTTP), OAuth routes
│   ├── server.ts             # MCP server factory (14 tools + 4 resources)
│   ├── api/firebase.ts       # Firebase Admin + subcollection helpers
│   ├── handlers/
│   │   ├── briefings.ts      # CRUD via Firestore subcollections
│   │   ├── editions.ts       # Edition retrieval
│   │   ├── sources.ts        # Source suggestions
│   │   └── discovery.ts      # 3-step onboarding flow
│   ├── middleware/
│   │   ├── auth.ts           # JWT + Firebase token auth, createJWT
│   │   └── rateLimit.ts      # Express rate limiter
│   ├── schemas/tools.ts      # Zod validation schemas
│   ├── types/                # TypeScript interfaces
│   └── utils/                # Logger (stderr in stdio), errors
├── examples/
│   └── claude_desktop_config.json
├── build.mjs                 # esbuild script
├── Dockerfile                # Cloud Run (node:20-alpine)
├── cloudbuild.yaml           # Google Cloud Build
└── .env.example              # Environment template
```

## Implementation History

| Phase | Commit | What |
|-------|--------|------|
| Phase 1 | `8e3cbc7` | MCP server with 14 tools, dual transport (stdio + HTTP) |
| Phase 2 | `21f8f52` | OAuth flow, MCP Resources, Firestore subcollection fix |
| Phase 2b | `3d5602b` | Deploy to Cloud Run, custom domain mcp.protime.ai |
| Phase 2b | TODO | OAuth consent page in mnl-front |
| Phase 3 | TODO | OpenClaw messaging gateway (WhatsApp, Telegram) |

## Concept Document

Full strategy, architecture, and roadmap: [`docs/PROTIME_MCP_CONCEPT.md`](../docs/PROTIME_MCP_CONCEPT.md)
