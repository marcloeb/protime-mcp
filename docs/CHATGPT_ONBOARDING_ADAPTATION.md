# ChatGPT Onboarding Adaptation - Protime MCP Integration

**Document Version**: 1.0
**Last Updated**: October 14, 2025
**Purpose**: Adapt the 3-step onboarding flow (Topic Discovery → Source Discovery → Results) for ChatGPT conversational interface

---

## 🎯 Overview

### Challenge
The web onboarding (Step 1-2-3) is designed for visual UI with forms, buttons, and animations. ChatGPT requires a **conversational** approach where the AI assistant guides users through the same flow via natural language.

### Solution
Transform the 3-step onboarding into **3 MCP tools** that work conversationally:

1. **`discover_topics`** → Replaces Step 1 (ContentDiscoveryStep)
2. **`discover_sources`** → Replaces Step 2 (SourceDiscoveryStep)
3. **`create_briefing_from_discovery`** → Finalizes and creates briefing

---

## 📊 Current State vs Target State

### Web Onboarding (Current)

```
Step 1: ContentDiscoveryStep (Visual UI)
├─ User clicks categories (AI Safety, Startups)
├─ User clicks "Refine Topics" button
├─ AI suggests sub-topics
├─ User selects regions (Switzerland)
└─ System saves to onboarding context

Step 2: SourceDiscoveryStep (Visual UI)
├─ Show 5-7s progress animation
├─ Auto-discover 15+ sources
├─ Display Protime inbox address
└─ Save sources to briefing

Step 3: Results
├─ Show "Briefing ready"
└─ First edition generates
```

### ChatGPT Integration (Target)

```
ChatGPT Conversation Flow:

User: "I want briefings on AI Safety"
ChatGPT: [Calls discover_topics tool]
ChatGPT: "I found these related topics:
         • AI Safety Regulations
         • AI Ethics & Governance
         • Large Language Models
         • AI Risk Assessment
         Would you like to refine further or add regions?"

User: "Add Switzerland and focus on regulations"
ChatGPT: [Calls discover_topics with refinement]
ChatGPT: "Perfect! I've refined to:
         • AI Safety · Switzerland · Regulations
         Ready to find sources?"

User: "Yes"
ChatGPT: [Calls discover_sources tool]
ChatGPT: "Found 15 sources:
         • 8 newsletters (auto-subscribed)
         • 4 RSS feeds
         • 3 YouTube channels
         Your Protime inbox: marc@cora.computer
         Creating your briefing now..."

ChatGPT: [Calls create_briefing_from_discovery]
ChatGPT: "✓ Briefing created! You'll receive your first
         edition within 24 hours. Want to see what we found?"

User: "Show me"
ChatGPT: [Calls get_edition_content]
ChatGPT: [Displays summaries]
```

**Key Difference**: No visual UI, everything happens through conversation and tool calls.

---

## 🛠️ New MCP Tools Needed

### Tool 1: `discover_topics`

**Purpose**: Replaces Step 1 (ContentDiscoveryStep) - Interactive topic discovery with refinement

**Input Schema**:
```typescript
{
  name: 'discover_topics',
  description: 'Discover and refine topics for a briefing based on user interests. Supports multi-round refinement to narrow down from broad categories to specific sub-topics.',
  inputSchema: {
    type: 'object',
    properties: {
      topics: {
        type: 'array',
        items: { type: 'string' },
        description: 'Initial topics or refinement selections (e.g., ["AI Safety", "Startups"])',
        minItems: 1,
      },
      regions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional geographic focus (e.g., ["Switzerland", "Germany"])',
      },
      refinementLevel: {
        type: 'number',
        description: 'Refinement round (0=initial, 1=first refinement, 2=deep dive)',
        minimum: 0,
        maximum: 3,
        default: 0,
      },
      customKeywords: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional specific keywords or niche topics',
      },
    },
    required: ['topics'],
  },
}
```

**Output Example**:
```json
{
  "discoveredTopics": {
    "mainCategories": ["AI Safety", "Startups"],
    "subTopics": [
      { "id": "ai-regulation", "label": "AI Regulations", "relevance": 92 },
      { "id": "ai-ethics", "label": "AI Ethics & Governance", "relevance": 88 },
      { "id": "llm-safety", "label": "Large Language Model Safety", "relevance": 85 }
    ],
    "regions": ["Switzerland", "Europe"],
    "customKeywords": ["AI Act", "GDPR"],
    "refinementLevel": 1,
    "canRefineMore": true
  },
  "discoveryPrompt": "I'm interested in AI Safety and Startups, with focus on AI Regulations, AI Ethics, Switzerland, and keywords: AI Act, GDPR",
  "nextSteps": "Ready to discover sources for these topics?"
}
```

**Implementation**:
```typescript
// handlers/discovery.ts
import { httpsCallable } from 'firebase/functions';

export async function discoverTopics(
  user: User,
  request: DiscoverTopicsRequest
): Promise<DiscoverTopicsResponse> {
  // Call existing refineInterests Cloud Function
  const refineInterestsFn = httpsCallable(functions, 'refineInterests');

  const result = await refineInterestsFn({
    categories: request.topics,
    refinementLevel: request.refinementLevel,
    regions: request.regions,
  });

  // Store discovery state in user session (Redis or Firestore)
  await storeDiscoverySession(user.id, {
    topics: request.topics,
    subTopics: result.data.subTopics,
    regions: request.regions,
    customKeywords: request.customKeywords,
    refinementLevel: request.refinementLevel,
    timestamp: new Date(),
  });

  return {
    discoveredTopics: {
      mainCategories: request.topics,
      subTopics: result.data.subTopics,
      regions: request.regions || [],
      customKeywords: request.customKeywords || [],
      refinementLevel: request.refinementLevel,
      canRefineMore: request.refinementLevel < 2,
    },
    discoveryPrompt: generateDiscoveryPrompt(request, result.data.subTopics),
    nextSteps: 'Ready to discover sources for these topics?',
  };
}
```

---

### Tool 2: `discover_sources`

**Purpose**: Replaces Step 2 (SourceDiscoveryStep) - Auto-discover RSS, newsletters, YouTube, etc.

**Input Schema**:
```typescript
{
  name: 'discover_sources',
  description: 'Automatically discover high-quality content sources (newsletters, RSS feeds, YouTube channels) based on previously discovered topics. Returns discovered sources and Protime inbox address.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Discovery session ID from discover_topics (optional if using same user session)',
      },
      skipNewsletters: {
        type: 'boolean',
        description: 'Skip newsletter auto-subscription (only discover RSS/YouTube)',
        default: false,
      },
    },
  },
}
```

**Output Example**:
```json
{
  "discoveredSources": {
    "total": 15,
    "breakdown": {
      "newsletters": 8,
      "rss": 4,
      "youtube": 3,
      "googleSearch": 6
    },
    "details": {
      "newsletters": [
        { "name": "Import AI", "status": "subscribed", "category": "AI Safety" },
        { "name": "The Gradient", "status": "pending_captcha", "category": "AI Research" }
      ],
      "rss": [
        { "url": "https://techcrunch.com/feed", "title": "TechCrunch", "category": "Startups" }
      ],
      "youtube": [
        { "channelId": "UCHnyfMqiRRG1u-2MsSQLbXA", "name": "Veritasium", "category": "Science" }
      ]
    }
  },
  "protimeInbox": "marc@cora.computer",
  "status": "ready_to_create_briefing",
  "message": "Discovered 15 sources. 8 newsletters auto-subscribed, 4 need CAPTCHA (will suggest later)."
}
```

**Implementation**:
```typescript
// handlers/discovery.ts
export async function discoverSources(
  user: User,
  request: DiscoverSourcesRequest
): Promise<DiscoverSourcesResponse> {
  // Retrieve discovery session
  const session = await getDiscoverySession(user.id, request.sessionId);

  if (!session) {
    throw new NotFoundError('Discovery session not found. Please run discover_topics first.');
  }

  // Call new discoverSources Cloud Function
  const discoverSourcesFn = httpsCallable(functions, 'discoverSources');

  const result = await discoverSourcesFn({
    interests: session.topics,
    subTopics: session.subTopics.map(st => st.id),
    regions: session.regions,
    customTopics: session.customKeywords,
    userId: user.id,
    skipNewsletters: request.skipNewsletters,
  });

  // Store discovered sources in session
  await updateDiscoverySession(user.id, {
    discoveredSources: result.data,
    status: 'sources_ready',
  });

  return {
    discoveredSources: result.data,
    protimeInbox: `${user.emailSlug || user.email.split('@')[0]}@cora.computer`,
    status: 'ready_to_create_briefing',
    message: formatSourceDiscoveryMessage(result.data),
  };
}
```

---

### Tool 3: `create_briefing_from_discovery`

**Purpose**: Finalizes the discovery flow and creates the actual briefing with discovered sources

**Input Schema**:
```typescript
{
  name: 'create_briefing_from_discovery',
  description: 'Create a briefing using topics and sources from the discovery flow. This completes the onboarding process and generates the first briefing edition.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Discovery session ID (optional if using same user session)',
      },
      title: {
        type: 'string',
        description: 'Custom title for the briefing (auto-generated if not provided)',
        maxLength: 100,
      },
      schedule: {
        type: 'string',
        enum: ['daily', 'weekly', 'monthly'],
        description: 'How often to generate new briefings',
        default: 'weekly',
      },
      generateFirstEdition: {
        type: 'boolean',
        description: 'Generate first edition immediately (default: true)',
        default: true,
      },
    },
  },
}
```

**Output Example**:
```json
{
  "briefing": {
    "id": "brief-abc123",
    "title": "AI Safety & Startups - Switzerland",
    "schedule": "weekly",
    "active": true,
    "createdAt": "2025-10-14T22:00:00Z"
  },
  "sources": {
    "total": 15,
    "active": 11,
    "pending": 4
  },
  "firstEdition": {
    "id": "edition-xyz789",
    "status": "generating",
    "estimatedReady": "2025-10-15T10:00:00Z"
  },
  "message": "Briefing created! Your first edition will be ready within 24 hours. You can view it using get_edition_content tool.",
  "nextSteps": [
    "Forward newsletters to marc@cora.computer",
    "Check suggested sources in settings (4 need manual subscription)"
  ]
}
```

**Implementation**:
```typescript
// handlers/discovery.ts
export async function createBriefingFromDiscovery(
  user: User,
  request: CreateBriefingFromDiscoveryRequest
): Promise<CreateBriefingFromDiscoveryResponse> {
  // Retrieve complete discovery session
  const session = await getDiscoverySession(user.id, request.sessionId);

  if (!session || session.status !== 'sources_ready') {
    throw new ValidationError('Discovery not complete. Run discover_topics and discover_sources first.');
  }

  // Generate title if not provided
  const title = request.title || generateBriefingTitle(session.topics, session.regions);

  // Create briefing document
  const briefingRef = collections.briefings.doc();
  const briefing: Briefing = {
    id: briefingRef.id,
    userId: user.id,
    title,
    archived: false,
    issueCount: 0,
    type: 'private',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    settings: {
      briefingsCreated: 0,
      emailsToProcess: 0,
      newslettersInInbox: 0,
      contentSources: {
        inboundEmail: {
          enabled: true,
        },
        ...session.discoveredSources, // RSS, YouTube, Google Search
      },
      categories: session.topics,
      language: 'en',
      summariesPerCategory: 5,
      summariesPerPublication: 3,
      scheduleFrequency: request.schedule || 'Weekly',
      scheduleTime: '08:00',
      isGenerationEnabled: true,
      isEmailEnabled: true,
      followLinks: true,
      alternateEmails: [],
      isSelectByTimeEnabled: false,
      interests: session.discoveryPrompt, // Use discovery prompt
    },
  };

  await briefingRef.set(briefing);

  // Trigger first edition generation if requested
  let firstEdition = null;
  if (request.generateFirstEdition) {
    const generateFn = httpsCallable(functions, 'triggerBriefingGeneration');
    await generateFn({ briefingId: briefing.id });

    firstEdition = {
      id: 'pending',
      status: 'generating',
      estimatedReady: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  // Clean up discovery session
  await deleteDiscoverySession(user.id);

  return {
    briefing: {
      id: briefing.id,
      title: briefing.title,
      schedule: briefing.settings.scheduleFrequency.toLowerCase(),
      active: briefing.settings.isGenerationEnabled,
      createdAt: briefing.createdAt.toDate(),
    },
    sources: {
      total: session.discoveredSources.totalSources,
      active: session.discoveredSources.breakdown.newsletters +
              session.discoveredSources.breakdown.rss +
              session.discoveredSources.breakdown.youtube,
      pending: session.discoveredSources.suggestedForLater || 0,
    },
    firstEdition,
    message: 'Briefing created! Your first edition will be ready within 24 hours.',
    nextSteps: [
      `Forward newsletters to ${user.emailSlug || user.email.split('@')[0]}@cora.computer`,
      session.discoveredSources.suggestedForLater > 0
        ? `Check suggested sources in settings (${session.discoveredSources.suggestedForLater} need manual subscription)`
        : null,
    ].filter(Boolean),
  };
}
```

---

##  🗄️ Discovery Session Storage

### Why Needed?
ChatGPT conversations are stateless across tool calls. We need to store intermediate state between `discover_topics` → `discover_sources` → `create_briefing_from_discovery`.

### Storage Options

**Option 1: Firestore (Recommended)**
```typescript
interface DiscoverySession {
  userId: string;
  sessionId: string;
  status: 'topics_discovered' | 'sources_ready' | 'completed' | 'expired';
  createdAt: Timestamp;
  expiresAt: Timestamp; // 24 hours from creation

  // Step 1 data
  topics: string[];
  subTopics: Array<{ id: string; label: string; relevance: number }>;
  regions: string[];
  customKeywords: string[];
  refinementLevel: number;
  discoveryPrompt: string;

  // Step 2 data
  discoveredSources?: {
    totalSources: number;
    breakdown: { newsletters: number; rss: number; youtube: number; googleSearch: number };
    details: { newsletters: any[]; rss: any[]; youtube: any[]; googleSearch: any[] };
    suggestedForLater: number;
  };
}

// Firestore path: /users/{userId}/discoverySessions/{sessionId}
```

**Option 2: Redis (Faster, but requires setup)**
```typescript
// Store in Redis with 24-hour TTL
await redis.setex(
  `discovery:${userId}`,
  86400, // 24 hours
  JSON.stringify(sessionData)
);
```

**Recommendation**: Use Firestore for MVP (no additional infrastructure), migrate to Redis if performance becomes an issue.

---

## 🔄 Conversation Flows

### Flow 1: Simple "Just Create It" (Fastest)

```
User: "Create a briefing about AI safety in Switzerland"

ChatGPT: [Calls discover_topics directly]
ChatGPT: [Calls discover_sources immediately]
ChatGPT: [Calls create_briefing_from_discovery]
ChatGPT: "Done! Created 'AI Safety - Switzerland' briefing with
         12 sources. First edition arrives in 24 hours."
```

**Tools called**: 3 (discover_topics → discover_sources → create_briefing_from_discovery)
**User messages**: 1
**Time**: < 10 seconds

---

### Flow 2: Interactive Refinement (Better Quality)

```
User: "I want a briefing on technology"

ChatGPT: [Calls discover_topics with "technology"]
ChatGPT: "I found these tech topics:
         • AI & Machine Learning
         • Startups & Innovation
         • Crypto & Web3
         • Climate Tech
         Which interests you most?"

User: "AI and startups, especially in Europe"

ChatGPT: [Calls discover_topics with refinement]
ChatGPT: "Got it! Narrowed to:
         • AI Safety
         • AI Applications
         • European Tech Startups
         • Venture Capital
         Want to go deeper or find sources?"

User: "Find sources"

ChatGPT: [Calls discover_sources]
ChatGPT: "Found 15 sources including The Gradient,
         TechCrunch Europe, and Sifted. Creating briefing..."

ChatGPT: [Calls create_briefing_from_discovery]
ChatGPT: "✓ Briefing created! You'll get updates weekly."
```

**Tools called**: 4 (discover_topics → discover_topics → discover_sources → create_briefing_from_discovery)
**User messages**: 3
**Time**: < 30 seconds

---

### Flow 3: Full Exploration (Most Detailed)

```
User: "Help me set up a briefing"

ChatGPT: "What topics interest you? (e.g., technology, business, science)"

User: "Climate tech and European policy"

ChatGPT: [Calls discover_topics]
ChatGPT: "I found these sub-topics:
         • EU Climate Regulations (95% relevance)
         • Carbon Capture Tech (88% relevance)
         • Renewable Energy Policy (92% relevance)
         • Climate Finance (85% relevance)
         Want to add more or refine?"

User: "Add carbon finance and focus on Germany"

ChatGPT: [Calls discover_topics with refinement + region]
ChatGPT: "Perfect! Your focus:
         • Climate Tech
         • EU Climate Regulations
         • Carbon Capture
         • Carbon Finance
         • Region: Germany
         Ready to discover sources?"

User: "Yes"

ChatGPT: [Calls discover_sources]
ChatGPT: "Discovered 18 sources:
         ✓ 10 newsletters (8 subscribed, 2 need CAPTCHA)
         ✓ 5 RSS feeds (CleanTechnica, EurActiv)
         ✓ 3 YouTube channels
         Your inbox: marc@cora.computer
         Create briefing now?"

User: "Yes, weekly schedule"

ChatGPT: [Calls create_briefing_from_discovery with schedule=weekly]
ChatGPT: "✓ Created 'Climate Tech - Germany' briefing!
         • Weekly updates every Monday 8am
         • 18 sources tracking
         • First edition: Tomorrow morning

         Want to see what sources we're tracking?"
```

**Tools called**: 5
**User messages**: 5
**Time**: 1-2 minutes

---

## 📊 Comparison: Web vs ChatGPT

| Aspect | Web UI | ChatGPT MCP |
|--------|--------|-------------|
| **Input Method** | Clicks, buttons, forms | Natural language conversation |
| **Topic Selection** | Visual category grid | AI-guided discovery |
| **Refinement** | Click "Refine Topics" button | Conversational back-and-forth |
| **Source Discovery** | 5-7s progress animation | Instant tool call |
| **User Effort** | 10-15 clicks | 1-5 messages |
| **Time to Complete** | 30-60 seconds | 10-120 seconds |
| **Flexibility** | Structured steps | Flexible conversation |
| **Discovery Quality** | Visual browsing | AI-assisted curation |
| **Skip Steps** | Can't skip | Can go straight to creation |

**Key Insight**: ChatGPT flow is **more flexible** but requires **good conversational design** to prevent user confusion.

---

## 🎨 UI/UX Principles for ChatGPT

### 1. Progressive Disclosure
Don't overwhelm users with all options at once. Start simple:

```
❌ Bad:
"I can help you create briefings. First, select from these 50 categories,
then choose sub-topics, add regions, set schedule, configure sources..."

✅ Good:
"What topics interest you? (e.g., AI, climate, startups)"
```

### 2. Confirmation Before Action
Always confirm before creating briefing:

```
ChatGPT: "Ready to create your briefing with these settings:
         • Topic: AI Safety
         • Region: Switzerland
         • Sources: 15 found
         • Schedule: Weekly
         Proceed?"
```

### 3. Show Progress
Tell users what's happening:

```
ChatGPT: "Discovering sources for AI Safety... (this takes 5-10s)"
[Calls discover_sources]
ChatGPT: "Found 12 sources!"
```

### 4. Offer Shortcuts
Let power users skip steps:

```
User: "Create AI safety briefing for Switzerland, weekly"

ChatGPT: [Skips all discovery steps, goes straight to creation]
```

### 5. Surface Key Info
Always show:
- Protime inbox address
- Number of sources discovered
- Schedule
- Next steps

---

## 🔧 Implementation Changes Required

### 1. New Cloud Functions (mnl-front/functions/src/chatgpt-api/)

```
functions/src/chatgpt-api/
├── discoverTopics.ts         # NEW - Topic discovery with refinement
├── discoverSources.ts         # NEW - Auto-discover sources
├── createBriefingFromDiscovery.ts  # NEW - Finalize and create
└── discoverySession.ts        # NEW - Session management helpers
```

### 2. Update MCP Server (openai-app-sdk/src/)

```
src/
├── tools/index.ts             # ADD: 3 new discovery tools
├── handlers/
│   └── discovery.ts           # NEW - Discovery flow handlers
├── types/
│   └── discovery.ts           # NEW - Discovery types
└── schemas/
    └── discovery.ts           # NEW - Discovery validation schemas
```

### 3. Reuse Existing Logic

**From Web Onboarding**:
- ✅ `refineInterests` Cloud Function (Step 1 logic)
- ✅ Category sections data (CATEGORY_SECTIONS)
- ✅ Geographic selection logic
- ✅ Custom topic handling

**New Required**:
- ❌ `discoverSources` Cloud Function (Step 2 backend)
- ❌ Discovery session storage
- ❌ Conversational prompts for ChatGPT

---

## 🧪 Testing Strategy

### Unit Tests

```typescript
// Test discovery tools
describe('discover_topics', () => {
  it('should return sub-topics for AI Safety', async () => {
    const result = await discoverTopics(mockUser, {
      topics: ['ai-safety'],
      refinementLevel: 0,
    });

    expect(result.discoveredTopics.subTopics.length).toBeGreaterThan(0);
    expect(result.canRefineMore).toBe(true);
  });

  it('should store session in Firestore', async () => {
    await discoverTopics(mockUser, { topics: ['ai-safety'] });

    const session = await getDiscoverySession(mockUser.id);
    expect(session.topics).toContain('ai-safety');
  });
});

describe('discover_sources', () => {
  it('should discover sources from session', async () => {
    // Setup session first
    await createDiscoverySession(mockUser.id, mockSessionData);

    const result = await discoverSources(mockUser, {});

    expect(result.discoveredSources.total).toBeGreaterThan(0);
    expect(result.protimeInbox).toContain('@cora.computer');
  });
});

describe('create_briefing_from_discovery', () => {
  it('should create briefing with discovered sources', async () => {
    // Setup complete session
    await createDiscoverySession(mockUser.id, completeSessionData);

    const result = await createBriefingFromDiscovery(mockUser, {
      schedule: 'weekly',
    });

    expect(result.briefing.id).toBeDefined();
    expect(result.sources.total).toBeGreaterThan(0);
  });
});
```

### Integration Tests (ChatGPT Simulator)

```typescript
// Simulate complete conversation flow
describe('ChatGPT Discovery Flow', () => {
  it('should complete full discovery in conversation', async () => {
    const chat = new ChatGPTSimulator(mockUser);

    // Step 1: User asks for briefing
    await chat.message('Create AI safety briefing');
    expect(chat.lastToolCall).toBe('discover_topics');

    // Step 2: ChatGPT refines
    expect(chat.lastResponse).toContain('AI Safety');

    // Step 3: User confirms
    await chat.message('Yes, find sources');
    expect(chat.lastToolCall).toBe('discover_sources');

    // Step 4: ChatGPT creates
    expect(chat.lastToolCall).toBe('create_briefing_from_discovery');

    // Verify briefing exists
    const briefing = await getBriefing(chat.lastBriefingId);
    expect(briefing.settings.contentSources).toBeDefined();
  });
});
```

### E2E Tests (Real ChatGPT)

1. Test in ChatGPT Developer Mode
2. Run through all 3 flows (simple, interactive, full)
3. Verify briefings created correctly in Firebase
4. Check first edition generates
5. Verify sources work (RSS, newsletters)

---

## 📈 Success Metrics

### Completion Rates

| Flow Type | Target Completion | Actual | Notes |
|-----------|------------------|--------|-------|
| Simple (1 message) | 95% | TBD | "Just create it" |
| Interactive (3 messages) | 85% | TBD | Standard flow |
| Full (5+ messages) | 70% | TBD | Power users |

### Time to Complete

- **Simple**: < 10 seconds
- **Interactive**: < 30 seconds
- **Full**: < 2 minutes

### User Satisfaction

- **NPS Score**: > 50
- **"Easy to use"**: > 4.5/5
- **"Better than web"**: > 60%

---

## 🚧 Open Questions

### 1. Session Expiration
**Question**: How long to keep discovery sessions?
- Option A: 24 hours (generous)
- Option B: 1 hour (conservative)
- Option C: 30 minutes (aggressive)

**Recommendation**: 1 hour, with automatic cleanup

---

### 2. Default Schedule
**Question**: What schedule for free tier users?
- Option A: Always weekly (simple)
- Option B: Let ChatGPT decide based on context
- Option C: Ask user explicitly

**Recommendation**: Option B - ChatGPT can infer from conversation

---

### 3. Source Discovery Timing
**Question**: When to call discover_sources?
- Option A: Automatically after discover_topics completes
- Option B: Wait for user confirmation
- Option C: ChatGPT decides based on context

**Recommendation**: Option B - gives user control

---

### 4. Showing Sources
**Question**: Should ChatGPT list all 15 sources or summarize?
- Option A: List all (verbose but transparent)
- Option B: Summarize counts only
- Option C: Show top 3-5, offer to show more

**Recommendation**: Option C - best balance

---

## ✅ Implementation Checklist

### Phase 1: Core Discovery Tools (Week 1)

- [ ] Create `discoverTopics` Cloud Function
- [ ] Create `discoverSources` Cloud Function
- [ ] Create `createBriefingFromDiscovery` Cloud Function
- [ ] Implement Firestore discovery session storage
- [ ] Add 3 new tools to MCP server
- [ ] Create discovery handlers in openai-app-sdk
- [ ] Write unit tests for all functions
- [ ] Test in ChatGPT Developer Mode

### Phase 2: Refinement & Polish (Week 2)

- [ ] Add session expiration and cleanup
- [ ] Improve conversational prompts
- [ ] Add error handling for partial sessions
- [ ] Implement session resume (if user returns)
- [ ] Add analytics tracking
- [ ] Write integration tests
- [ ] Document conversation flows

### Phase 3: Production Ready (Week 3)

- [ ] Load testing
- [ ] Security audit
- [ ] Rate limiting per user
- [ ] Monitoring and alerts
- [ ] Deploy to staging
- [ ] Beta test with 50 users
- [ ] Deploy to production

---

## 📚 Related Documentation

- **Web Onboarding**: `/mnl-front/docs/STEP2_SOURCE_DISCOVERY_CONCEPT.md`
- **MCP Server**: `/openai-app-sdk/README.md`
- **Implementation Strategy**: `/openai-app-sdk/docs/IMPLEMENTATION_STRATEGY.md`
- **API Reference**: `/mnl-front/functions/README.md`

---

## 💡 Key Takeaways

1. **3 New Tools**: `discover_topics`, `discover_sources`, `create_briefing_from_discovery`
2. **Session Storage**: Use Firestore with 1-hour expiration
3. **Flexible Flows**: Support 1-message to 5-message conversations
4. **Reuse Logic**: Leverage existing `refineInterests` Cloud Function
5. **Progressive Disclosure**: Don't overwhelm users, guide them step-by-step
6. **Always Confirm**: Show what's about to be created before creating

---

**Document Status**: ✅ Ready for Implementation
**Next Steps**: Begin Phase 1 - Core Discovery Tools

**Questions?** Marc Loeb