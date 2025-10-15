# Protime MCP Server for ChatGPT

OpenAI Apps SDK integration for Protime - bringing AI-powered briefings to ChatGPT's 800 million users.

## Overview

This MCP (Model Context Protocol) server exposes Protime's briefing capabilities to ChatGPT, allowing users to:
- Create topic briefings through natural conversation
- Configure sources and schedules conversationally
- View briefing editions directly in ChatGPT
- Get personalized AI summaries without leaving ChatGPT

## Architecture

```
ChatGPT → MCP Server (Cloud Run) → Firebase Backend → summi-cloud (Python)
```

- **MCP Server**: Node.js/TypeScript server exposing tools via Model Context Protocol
- **Deployment**: Google Cloud Run (serverless, auto-scaling)
- **Authentication**: OAuth 2.0 flow linking ChatGPT users to Protime accounts
- **Backend**: Existing Protime Firebase infrastructure (mnl-front + summi-cloud)

## Prerequisites

- Node.js 20+
- Google Cloud SDK
- Firebase project access (protime-summi)
- OpenAI ChatGPT Apps SDK credentials

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

Required environment variables:
```bash
# Server
PORT=8080
NODE_ENV=development

# Firebase
FIREBASE_PROJECT_ID=protime-summi
FIREBASE_SERVICE_ACCOUNT_KEY_PATH=./service-account-key.json

# ChatGPT OAuth
CHATGPT_CLIENT_ID=your_client_id
CHATGPT_CLIENT_SECRET=your_client_secret
OAUTH_CALLBACK_URL=http://localhost:8080/auth/callback

# Security
SESSION_SECRET=your_32_char_secret
JWT_SECRET=your_32_char_secret
```

### 3. Run Locally

```bash
npm run dev
```

Server runs on `http://localhost:8080`

### 4. Test in ChatGPT Developer Mode

1. Open ChatGPT Settings → Apps → Developer Mode
2. Add server URL: `http://localhost:8080`
3. Test tool invocations

## MCP Tools

### `create_briefing`
Create a new topic briefing

**Input:**
```json
{
  "topic": "AI regulations",
  "description": "Track EU AI Act updates"
}
```

**Output:**
```json
{
  "briefing": {
    "id": "uuid",
    "topic": "AI regulations",
    "schedule": "weekly",
    "active": true
  }
}
```

### `get_briefings`
List all user's briefings

**Input:**
```json
{
  "limit": 10,
  "offset": 0
}
```

### `get_briefing_config`
Get detailed briefing configuration

**Input:**
```json
{
  "briefingId": "uuid"
}
```

### `update_briefing`
Modify briefing settings

**Input:**
```json
{
  "briefingId": "uuid",
  "settings": {
    "schedule": "daily",
    "sources": ["https://example.com/feed"],
    "categories": ["Product", "Research"]
  }
}
```

### `get_editions`
Fetch past briefing editions

**Input:**
```json
{
  "briefingId": "uuid",
  "limit": 10
}
```

### `get_edition_content`
Read specific edition with full content

**Input:**
```json
{
  "editionId": "uuid"
}
```

### `suggest_sources`
Get newsletter/RSS recommendations

**Input:**
```json
{
  "topic": "climate tech",
  "limit": 5
}
```

### `delete_briefing`
Delete a briefing

**Input:**
```json
{
  "briefingId": "uuid"
}
```

## Deployment

### Deploy to Google Cloud Run

#### Staging

```bash
npm run deploy:staging
```

#### Production

```bash
npm run deploy:production
```

### Manual Deployment

```bash
# Build Docker image
docker build -t gcr.io/protime-summi/protime-mcp:latest .

# Push to Google Container Registry
docker push gcr.io/protime-summi/protime-mcp:latest

# Deploy to Cloud Run
gcloud run deploy protime-mcp-prod \
  --image gcr.io/protime-summi/protime-mcp:latest \
  --region europe-west3 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production \
  --min-instances 1 \
  --max-instances 100 \
  --memory 512Mi \
  --cpu 1
```

## Development

### Project Structure

```
src/
├── index.ts              # Server entry point
├── tools/                # MCP tool definitions
├── handlers/             # Business logic
│   ├── briefings.ts     # Briefing CRUD operations
│   ├── editions.ts      # Edition viewing
│   └── sources.ts       # Source discovery
├── api/                  # External services
│   └── firebase.ts      # Firebase Admin SDK
├── auth/                 # Authentication
│   └── oauth.ts         # OAuth strategy
├── schemas/              # Validation schemas
│   └── tools.ts         # Zod schemas
├── types/                # TypeScript types
│   ├── briefing.ts
│   └── user.ts
├── utils/                # Utilities
│   ├── logger.ts
│   └── errors.ts
└── middleware/           # Express middleware
```

### Running Tests

```bash
# Unit tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### Code Quality

```bash
# Lint
npm run lint

# Format
npm run format

# Type check
npm run build
```

## OAuth Flow

1. User invokes Protime in ChatGPT
2. MCP server redirects to Protime OAuth page
3. User logs in (or creates Protime account)
4. User grants ChatGPT permissions
5. OAuth callback returns auth code
6. MCP exchanges code for access token
7. Store ChatGPT user ↔ Protime user mapping
8. Return to ChatGPT with authenticated session

## Monitoring

### Logs

```bash
# View Cloud Run logs
gcloud run logs read protime-mcp-prod --region europe-west3

# Follow logs
gcloud run logs tail protime-mcp-prod --region europe-west3
```

### Metrics

View in Google Cloud Console:
- Request count and latency
- Error rates
- Instance count
- Memory/CPU usage

### Alerts

Configure alerts for:
- Error rate > 5%
- Latency p95 > 3s
- OAuth failures > 50/10min
- Instance count > 80

## Security

### Authentication
- OAuth 2.0 for ChatGPT → Protime user linking
- Firebase Auth tokens for API calls
- JWT for session management

### Authorization
- All tools verify user ownership of resources
- Tier-based access control (free vs. pro)
- Rate limiting per user

### Input Validation
- Zod schemas validate all inputs
- Firestore security rules enforce backend permissions
- SQL injection prevention (using Firestore SDK)

## Troubleshooting

### OAuth failures
```bash
# Check credentials
echo $CHATGPT_CLIENT_ID
echo $CHATGPT_CLIENT_SECRET

# Verify callback URL matches ChatGPT configuration
```

### Firebase connection errors
```bash
# Verify service account
gcloud auth application-default print-access-token

# Check Firestore access
firebase firestore:get /briefings/test-id
```

### Cloud Run deployment issues
```bash
# Check build logs
gcloud builds list --limit=5

# View service details
gcloud run services describe protime-mcp-prod --region europe-west3
```

## Support

- **Documentation**: `/docs` folder
- **Issues**: GitHub Issues
- **Email**: marc@protime.ai

## License

MIT License - See LICENSE file for details
