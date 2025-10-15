# ChatGPT Onboarding Implementation Guide

This guide explains how to deploy and test the new ChatGPT discovery flow that adapts the web onboarding experience for conversational interfaces.

## Overview

The implementation consists of three main components:

1. **Cloud Functions** (`mnl-front/functions/src/`)
   - `discoverTopics.ts` - Step 1: Topic discovery with multi-round refinement
   - `discoverSources.ts` - Step 2: Automatic source discovery
   - `createBriefingFromDiscovery.ts` - Step 3: Briefing creation

2. **MCP Server** (`openai-app-sdk/`)
   - Discovery handlers (`src/handlers/discovery.ts`)
   - Tool definitions (`src/tools/index.ts`)
   - Tool routing (`src/handlers/toolRouter.ts`)

3. **Firestore** (Database)
   - Discovery session storage with 1-hour TTL
   - Path: `/users/{userId}/discoverySessions/{sessionId}`

## Architecture

```
ChatGPT → MCP Server → Cloud Functions → Firestore
                          ↓
                    Gemini AI (refineInterests)
```

### Data Flow

1. User starts conversation with ChatGPT
2. ChatGPT calls `discover_topics` MCP tool
3. MCP server authenticates user and calls `discoverTopics` Cloud Function
4. Cloud Function calls `refineInterests` (reuses existing web logic)
5. Cloud Function saves discovery session to Firestore
6. Returns sessionId + discovered topics to ChatGPT
7. User optionally refines topics (repeat steps 2-6 with higher refinementLevel)
8. ChatGPT calls `discover_sources` MCP tool with sessionId
9. Cloud Function auto-discovers RSS, newsletters, YouTube, Google Search
10. ChatGPT calls `create_briefing_from_discovery` with schedule preferences
11. Complete briefing created with all sources configured

## Deployment Steps

### 1. Deploy Cloud Functions

```bash
cd mnl-front/functions

# Install dependencies if needed
npm install

# Deploy all functions (includes new discovery functions)
firebase deploy --only functions

# Or deploy specific functions
firebase deploy --only functions:discoverTopics,functions:discoverSources,functions:createBriefingFromDiscovery
```

**Expected output:**
```
✔  functions[discoverTopics(europe-west3)] Successful create operation.
✔  functions[discoverSources(europe-west3)] Successful create operation.
✔  functions[createBriefingFromDiscovery(europe-west3)] Successful create operation.
```

### 2. Set up Firestore Security Rules

Add to `firestore.rules`:

```javascript
// Discovery sessions - only user can read/write their own
match /users/{userId}/discoverySessions/{sessionId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;

  // Auto-expire sessions after 1 hour
  allow delete: if request.auth != null
    && request.auth.uid == userId
    && resource.data.expiresAt < request.time;
}
```

Deploy rules:
```bash
firebase deploy --only firestore:rules
```

### 3. Deploy MCP Server

```bash
cd openai-app-sdk

# Install dependencies (includes new axios)
npm install

# Build TypeScript
npm run build

# Deploy to Cloud Run (staging)
npm run deploy:staging

# Or deploy to production
npm run deploy:production
```

**Environment Variables (Cloud Run):**
- `NODE_ENV`: production
- `FIREBASE_PROJECT_ID`: protime-summi
- `FIREBASE_FUNCTIONS_URL`: https://europe-west3-protime-summi.cloudfunctions.net
- `JWT_SECRET`: (Secret Manager)
- `SESSION_SECRET`: (Secret Manager)

### 4. Configure ChatGPT App

1. Go to [OpenAI Developer Platform](https://platform.openai.com/apps)
2. Create new app or update existing "Protime Briefings"
3. Configure MCP server URL:
   - Staging: `https://protime-mcp-staging-xxxxxxxx-ew.a.run.app`
   - Production: `https://protime-mcp-prod-xxxxxxxx-ew.a.run.app`
4. Set OAuth scopes: `briefings:read`, `briefings:write`
5. Enable tools: `discover_topics`, `discover_sources`, `create_briefing_from_discovery`

## Testing

### Local Testing (Development)

1. **Start Firebase Emulators:**
```bash
cd mnl-front
npm run start:emulator
```

2. **Start MCP Server Locally:**
```bash
cd openai-app-sdk
cp .env.example .env
# Edit .env with local settings
npm run dev
```

3. **Test with cURL:**

**Test discover_topics:**
```bash
curl -X POST http://localhost:8080/tools/discover_topics \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TEST_TOKEN" \
  -d '{
    "topics": ["AI Safety", "Startups"],
    "regions": ["Switzerland"],
    "refinementLevel": 0
  }'
```

**Expected response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "abc123...",
    "subTopics": [
      {"id": "ai-ethics", "label": "AI Ethics", "relevance": 92},
      {"id": "gpt-4-applications", "label": "GPT-4 Applications", "relevance": 89},
      ...
    ],
    "topics": ["AI Safety", "Startups"],
    "regions": ["Switzerland"],
    "customKeywords": [],
    "refinementLevel": 0,
    "message": "Found 10 specific topics for your interests. Would you like to refine further?"
  }
}
```

**Test discover_sources:**
```bash
curl -X POST http://localhost:8080/tools/discover_sources \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TEST_TOKEN" \
  -d '{
    "sessionId": "abc123..."
  }'
```

**Expected response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "abc123...",
    "totalSources": 45,
    "breakdown": {
      "newsletters": 15,
      "rss": 20,
      "youtube": 8,
      "googleSearch": 2
    },
    "topSources": [
      {"name": "The Batch (Andrew Ng)", "url": "...", "type": "newsletter", "category": "ai", "relevance": 90},
      ...
    ],
    "message": "Discovered 45 content sources: 15 newsletters, 20 RSS feeds, 8 YouTube channels, and 2 Google Search queries."
  }
}
```

**Test create_briefing_from_discovery:**
```bash
curl -X POST http://localhost:8080/tools/create_briefing_from_discovery \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TEST_TOKEN" \
  -d '{
    "sessionId": "abc123...",
    "title": "My AI Safety Briefing",
    "schedule": {
      "frequency": "Daily",
      "time": "09:00"
    }
  }'
```

**Expected response:**
```json
{
  "success": true,
  "data": {
    "briefingId": "briefing123...",
    "briefing": {
      "id": "briefing123...",
      "title": "My AI Safety Briefing",
      "emailSlug": "my-ai-safety-briefing",
      ...
    },
    "message": "✅ Your \"My AI Safety Briefing\" briefing is ready!\n\nSchedule: Daily at 09:00\nDelivery: user@example.com\nForward newsletters to: user+my-ai-safety-briefing@protime.ai\n\nSources discovered: 45 (15 newsletters, 20 RSS feeds, 8 YouTube channels)\n\nYour first briefing will be generated according to your schedule."
  }
}
```

### Production Testing (ChatGPT)

1. Open ChatGPT and start conversation
2. Say: "Create a briefing about AI Safety and Startups in Switzerland"
3. ChatGPT should automatically call `discover_topics` tool
4. Review suggested topics, optionally refine
5. ChatGPT should call `discover_sources` tool
6. Review discovered sources
7. Specify schedule: "Daily at 9am"
8. ChatGPT should call `create_briefing_from_discovery` tool
9. Verify briefing created in Firestore:
   ```bash
   firebase firestore:get /users/YOUR_USER_ID/briefings/BRIEFING_ID
   ```

## Conversation Flows

### Simple Flow (1 message, <10 seconds)
```
User: "Create daily AI briefing at 9am"
ChatGPT: [calls discover_topics → discover_sources → create_briefing_from_discovery]
ChatGPT: "✅ Your AI briefing is ready! First edition tomorrow at 9am."
```

### Interactive Flow (3 messages, <30 seconds)
```
User: "Create briefing about AI Safety and Startups"
ChatGPT: [calls discover_topics] "I found these topics: [list]. Want to refine?"
User: "Yes, focus on GPT-4 Applications"
ChatGPT: [calls discover_topics with refinementLevel=1] "Here are specific areas: [list]"
User: "Perfect, send daily at 9am"
ChatGPT: [calls discover_sources → create_briefing_from_discovery] "✅ Done!"
```

### Full Flow (5+ messages, 1-2 minutes)
```
User: "I want to track AI topics"
ChatGPT: "What specific areas interest you?"
User: "AI Safety, specifically alignment research"
ChatGPT: [calls discover_topics] "Found topics: [list]. Any geographic focus?"
User: "Yes, Switzerland and Germany"
ChatGPT: [calls discover_topics with regions] "Here are region-specific topics: [list]"
User: "Add prompt engineering too"
ChatGPT: [calls discover_topics with customKeywords] "Updated list: [list]"
User: "Great! Show me sources"
ChatGPT: [calls discover_sources] "Found 45 sources: [breakdown]"
User: "Send weekly on Mondays at 10am to work@example.com"
ChatGPT: [calls create_briefing_from_discovery] "✅ All set!"
```

## Monitoring

### Cloud Function Logs
```bash
# View logs for discovery functions
firebase functions:log --only discoverTopics,discoverSources,createBriefingFromDiscovery

# Or use Cloud Console
https://console.cloud.google.com/functions/list?project=protime-summi
```

### Firestore Discovery Sessions
```bash
# List all active sessions for a user
firebase firestore:get /users/USER_ID/discoverySessions

# Check session expiration
# Sessions expire after 1 hour (expiresAt field)
```

### MCP Server Logs
```bash
# Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=protime-mcp-prod" --limit 50 --project protime-summi

# Or use Cloud Console
https://console.cloud.google.com/run?project=protime-summi
```

## Troubleshooting

### Error: "Discovery session not found"
- **Cause**: Session expired (>1 hour old) or invalid sessionId
- **Solution**: Start new discovery flow, don't reuse old sessionId

### Error: "User must be authenticated"
- **Cause**: Invalid or missing Firebase ID token
- **Solution**: Check OAuth flow, verify JWT token generation in discovery.ts

### Error: "Failed to refine interests"
- **Cause**: Gemini API error or invalid categories
- **Solution**: Check Cloud Function logs, verify GEMINI_API_KEY

### Error: "Briefing creation failed"
- **Cause**: Missing required fields or Firestore write error
- **Solution**: Verify all required fields in payload, check Firestore rules

### ChatGPT doesn't call tools
- **Cause**: Tool descriptions unclear or input schema mismatch
- **Solution**: Review tool descriptions in tools/index.ts, test with explicit instructions

## Cost Estimates

### API Costs (per 1000 users/month)
- **Gemini API** (refineInterests): ~$2.50
  - 2-3 calls per user @ $0.001/call
- **Firestore**: ~$1.00
  - Discovery sessions: $0.18/GB storage + $0.36/1M reads
- **Cloud Functions**: ~$5.00
  - 3-5 invocations per user @ $0.40/1M invocations
- **Total**: ~$8.50/1000 users

### Optimization Tips
- Use caching for common topic categories
- Batch Firestore writes
- Implement rate limiting for refinement rounds
- Clean up expired sessions automatically

## Next Steps

1. **Phase 1 (Complete)**: Basic discovery flow
   - ✅ Topic discovery with refinement
   - ✅ Source auto-discovery
   - ✅ Briefing creation

2. **Phase 2 (Planned)**: Enhanced features
   - [ ] Newsletter auto-subscription via Gemini Computer Use
   - [ ] YouTube channel validation
   - [ ] Google Search query optimization
   - [ ] Social media source integration (Instagram, TikTok via Apify)

3. **Phase 3 (Future)**: Advanced features
   - [ ] Source quality scoring
   - [ ] Topic similarity detection
   - [ ] Multi-language support
   - [ ] Team briefing creation

## Support

For questions or issues:
- **Technical Issues**: Check logs (Cloud Functions, MCP Server, Firestore)
- **ChatGPT Integration**: Review OpenAI Developer Platform docs
- **Deployment**: Verify Cloud Run configuration and environment variables

## References

- [OpenAI Apps SDK Documentation](https://platform.openai.com/docs/apps)
- [Model Context Protocol (MCP) Spec](https://spec.modelcontextprotocol.io/)
- [Firebase Cloud Functions](https://firebase.google.com/docs/functions)
- [Cloud Run Deployment](https://cloud.google.com/run/docs)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)

---

**Last Updated**: October 2025
**Version**: 1.0.0
**Maintained by**: Marc Loeb <marc@protime.ai>
