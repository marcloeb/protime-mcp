# Advanced Tool Use Patterns for Protime MCP Server

**Source:** https://www.anthropic.com/engineering/advanced-tool-use
**Date:** 2026-02-24
**Context:** Anthropic's engineering blog on three beta features that improve how AI models discover, learn, and execute tools. Directly applicable to our MCP server architecture.

---

## Why This Matters for Protime

Our MCP server exposes 11 tools to ChatGPT. The article identifies three patterns that solve problems we will hit as we scale:

| Problem We Have | Pattern That Solves It | Priority |
|---|---|---|
| 11 tool definitions consume context before conversation starts | Tool Search / Deferred Loading | Medium (matters at 20+ tools) |
| Discovery flow chains 3 tools sequentially, each polluting context | Programmatic Tool Calling | High |
| Complex parameters on `create_briefing_from_discovery` (schedule, regions, refinement levels) cause errors | Tool Use Examples | High |

---

## Pattern 1: Tool Use Examples (Implement First)

**Problem:** JSON schemas define structure but not usage. Our `discover_topics` tool has `refinementLevel` (0-3), optional `regions`, optional `customKeywords`, and a `sessionId` for continuity. ChatGPT guesses wrong parameters frequently.

**Solution:** Add 1-5 concrete examples per tool showing minimal, partial, and full usage patterns.

**Impact:** 72% to 90% accuracy on complex parameter handling (from Anthropic's benchmarks).

### What to Add to Our Tools

```typescript
// tools/index.ts - Add inputExamples to each tool definition

{
  name: 'discover_topics',
  description: '...',
  inputSchema: { ... },
  // NEW: concrete examples that show ChatGPT how to call this tool
  inputExamples: [
    // Minimal: first-time user, broad interests
    {
      topics: ["AI", "Climate Tech"],
      refinementLevel: 0
    },
    // With regions: user mentions geographic focus
    {
      topics: ["Startups", "VC Funding"],
      regions: ["Switzerland", "Germany"],
      refinementLevel: 0
    },
    // Refinement round: narrowing down from broad to specific
    {
      topics: ["AI Safety", "LLM Alignment"],
      refinementLevel: 2,
      sessionId: "sess_abc123",
      customKeywords: ["RLHF", "constitutional AI"]
    }
  ]
}
```

```typescript
{
  name: 'create_briefing_from_discovery',
  description: '...',
  inputSchema: { ... },
  inputExamples: [
    // Minimal: accept all defaults
    {
      sessionId: "sess_abc123"
    },
    // With schedule: user specifies when they want briefings
    {
      sessionId: "sess_abc123",
      title: "AI Regulations Weekly",
      schedule: {
        frequency: "Weekly",
        time: "09:00",
        weekday: "Monday"
      }
    },
    // Full specification: power user
    {
      sessionId: "sess_abc123",
      title: "Climate Tech Daily",
      schedule: {
        frequency: "Daily",
        time: "07:30"
      },
      deliveryEmail: "marc@protime.ai"
    }
  ]
}
```

### Priority Tools for Examples

1. **`discover_topics`** - Most complex input (refinement levels, sessions, regions)
2. **`create_briefing_from_discovery`** - Nested schedule object, optional fields
3. **`update_briefing`** - Nested settings with many optional combinations
4. **`suggest_sources`** - Simple, but shows topic format expectations

---

## Pattern 2: Programmatic Tool Calling (Implement Second)

**Problem:** The discovery flow chains 3 tools: `discover_topics` -> `discover_sources` -> `create_briefing_from_discovery`. Each intermediate result loads into ChatGPT's context. Discovery results (candidate newsletters, RSS feeds, scores) can be large and are only needed for the final briefing creation.

**Solution:** Mark tools with `allowed_callers: ["code_execution"]` so ChatGPT can orchestrate them via code. Intermediate results stay in the code execution environment. Only the final briefing confirmation enters the conversation.

**Impact:** 37% token reduction, eliminates multiple inference passes.

### How to Implement

```typescript
// Mark discovery tools as callable from code
{
  name: 'discover_topics',
  description: '...',
  inputSchema: { ... },
  allowed_callers: ['code_execution_20250825']  // ChatGPT can call from Python
}

{
  name: 'discover_sources',
  description: '...',
  inputSchema: { ... },
  allowed_callers: ['code_execution_20250825']
}

{
  name: 'create_briefing_from_discovery',
  description: '...',
  inputSchema: { ... },
  allowed_callers: ['code_execution_20250825']
}
```

### What ChatGPT Would Generate

Instead of 3 sequential tool calls polluting context, ChatGPT writes:

```python
# ChatGPT generates this code to orchestrate the flow
import asyncio

async def create_briefing_from_scratch(topics, regions=None):
    # Step 1: Discover and refine topics
    discovery = await call_tool("discover_topics", {
        "topics": topics,
        "regions": regions or [],
        "refinementLevel": 0
    })
    session_id = discovery["sessionId"]

    # Step 2: Auto-discover sources (results stay in code, not context)
    sources = await call_tool("discover_sources", {
        "sessionId": session_id
    })

    # Step 3: Create briefing with everything configured
    briefing = await call_tool("create_briefing_from_discovery", {
        "sessionId": session_id,
        "schedule": {"frequency": "Daily", "time": "09:00"}
    })

    # Only this final summary enters ChatGPT's context
    print(f"Created briefing '{briefing['title']}' with {sources['sourceCount']} sources")
    print(f"Schedule: {briefing['schedule']['frequency']} at {briefing['schedule']['time']}")

asyncio.run(create_briefing_from_scratch(["AI Safety", "LLM Alignment"], ["Switzerland"]))
```

### Which Tools to Enable

| Tool | Enable Code Execution? | Why |
|---|---|---|
| `discover_topics` | Yes | Intermediate step, results feed next tool |
| `discover_sources` | Yes | Returns potentially large source lists |
| `create_briefing_from_discovery` | Yes | Final step in chain |
| `get_editions` + `get_edition_content` | Yes | Fetch + read is a natural chain |
| `get_briefings` | No | Simple list, user wants to see it |
| `suggest_sources` | No | User wants to review suggestions |
| `delete_briefing` | No | User must explicitly confirm |

---

## Pattern 3: Tool Search / Deferred Loading (Implement Later)

**Problem:** All 11 tool definitions load into context before any conversation. At ~500 tokens per tool definition, that's ~5.5K tokens consumed before the user says anything. Not critical now, but will matter when we add more tools.

**Solution:** Keep 3-5 most-used tools always loaded. Defer the rest. ChatGPT discovers deferred tools on-demand via a search tool.

**Impact:** 85% context reduction. Accuracy improves because the model isn't overwhelmed with irrelevant tool definitions.

### When to Implement

Implement when we exceed 15-20 tools. Current 11 tools are manageable.

### Future Tool Growth Plan

As Protime evolves to "AI Chief of Staff", we'll likely add:
- `track_competitor` - Monitor competitor activity
- `create_action_item` - Generate action items from briefings
- `share_insight` - Share a briefing insight to LinkedIn/Slack
- `analyze_trend` - Deep-dive on a trending topic
- `get_recommendations` - Personalized content recommendations
- `set_alert` - Real-time alerts for breaking topics

At 17+ tools, implement deferred loading:

```typescript
// Always loaded: the core onboarding flow
{ name: 'discover_topics', defer_loading: false },
{ name: 'create_briefing_from_discovery', defer_loading: false },
{ name: 'get_briefings', defer_loading: false },
{ name: 'get_edition_content', defer_loading: false },

// Deferred: less frequent operations
{ name: 'update_briefing', defer_loading: true },
{ name: 'delete_briefing', defer_loading: true },
{ name: 'suggest_sources', defer_loading: true },
{ name: 'track_competitor', defer_loading: true },
{ name: 'create_action_item', defer_loading: true },
// ... etc
```

---

## Implementation Checklist

### Phase 1: Tool Use Examples (1-2 days)
- [ ] Add `inputExamples` to `discover_topics`
- [ ] Add `inputExamples` to `create_briefing_from_discovery`
- [ ] Add `inputExamples` to `update_briefing`
- [ ] Add `inputExamples` to `suggest_sources`
- [ ] Test in ChatGPT Developer Mode - verify parameter accuracy improves

### Phase 2: Programmatic Tool Calling (2-3 days)
- [ ] Add `allowed_callers` to discovery flow tools
- [ ] Add `allowed_callers` to edition reading chain
- [ ] Ensure tool return formats are well-documented (code needs to parse them)
- [ ] Make all code-callable operations idempotent (safe to retry)
- [ ] Test the discovery flow runs as single code block, not 3 inference passes

### Phase 3: Tool Search (when 15+ tools exist)
- [ ] Identify top 4-5 always-loaded tools based on usage data
- [ ] Mark remaining tools as `defer_loading: true`
- [ ] Write clear, searchable tool descriptions (search accuracy depends on this)
- [ ] Test that deferred tools are still discoverable

---

## API Configuration

When sending requests to the API, enable these beta features:

```python
# Python SDK example
client.beta.messages.create(
    betas=["advanced-tool-use-2025-11-20"],
    model="claude-sonnet-4-5-20250929",
    max_tokens=4096,
    tools=[
        # Tool Search (enable when 15+ tools)
        {"type": "tool_search_tool_regex_20251119", "name": "tool_search_tool_regex"},
        # Code Execution (enable for discovery flow)
        {"type": "code_execution_20250825", "name": "code_execution"},
        # Your tools with inputExamples and allowed_callers
        ...
    ]
)
```

**Note:** These are Anthropic API features. For the ChatGPT/OpenAI MCP integration, the equivalent patterns are:
- Tool Use Examples -> Add examples to your MCP tool schemas (supported by MCP spec)
- Programmatic Tool Calling -> ChatGPT handles this natively via its code interpreter
- Tool Search -> Not yet in MCP spec, but ChatGPT has its own tool selection logic

The principles transfer regardless of which AI platform consumes our MCP server.

---

## Key Takeaway

The article's core insight: **production tool use is about managing context, not just defining schemas.** Our MCP server already has good tool definitions. The next step is making them efficient to discover (search), efficient to execute (code orchestration), and accurate to call (examples).
