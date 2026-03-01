---
description: Discover and track a new topic — find relevant sources automatically
argument-hint: [topic to track, e.g. "AI regulations in Europe"]
---

# /discover

Start tracking a new topic. Protime discovers relevant newsletters, RSS feeds, YouTube channels, and news sources automatically — you don't have to search for them.

## Usage

```
/protime:discover AI safety
/protime:discover climate tech in DACH
/protime:discover competitor analysis for fintech startups
```

## How It Works

```
┌─────────────────────────────────────────────┐
│  Step 1: DISCOVER TOPICS                     │
│  Refine your interest from broad to specific │
│  "AI" → "AI Safety" → "EU AI Act Compliance" │
├─────────────────────────────────────────────┤
│  Step 2: DISCOVER SOURCES                    │
│  Auto-find newsletters, RSS, YouTube, news   │
│  10-30 sources per topic area               │
├─────────────────────────────────────────────┤
│  Step 3: CREATE BRIEFING                     │
│  Set schedule, delivery, and start tracking  │
│  First briefing arrives next morning         │
└─────────────────────────────────────────────┘
```

## Instructions

1. Call `discover_topics` with the user's topic. Include regions if mentioned.
2. Present the refined sub-topics and ask the user to pick which ones matter most.
3. If the user wants to go deeper, call `discover_topics` again with `refinementLevel: 1` (or 2, 3) using the same `sessionId`.
4. Once topics are confirmed, call `discover_sources` to find content sources.
5. Present the discovered sources (count by type, top sources by name).
6. Ask the user about schedule preference (daily, weekly, etc.) and delivery time.
7. Call `create_briefing_from_discovery` with the session, schedule, and optional title.
8. Confirm the briefing is set up and tell the user when to expect the first edition.

## Output Format

After discovery:
```
Found [count] sources for "[topic]":
• [count] newsletters
• [count] RSS feeds
• [count] YouTube channels
• [count] Google Search queries

Top sources:
1. [Source name] — [description]
2. [Source name] — [description]
3. [Source name] — [description]
```

After creation:
```
Your briefing "[title]" is set up.

Schedule: [frequency] at [time]
Sources: [count] sources tracking your topics
First briefing: [expected date]

You can add more sources anytime with: "add [URL] to my [topic] briefing"
```

## Guidelines

- Guide the user through refinement — don't skip to source discovery
- If the user gives a broad topic like "AI", suggest narrowing it down
- Always confirm the schedule before creating the briefing
- Mention that sources improve over time as Protime learns what's relevant

## Tips

- Add specific URLs you already read with: "add https://example.com/feed to my briefing"
- Change what's active with: "show my briefings" then select which ones to keep
