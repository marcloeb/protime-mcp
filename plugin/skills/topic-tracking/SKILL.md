---
name: topic-tracking
description: Track any topic with AI-powered content discovery and daily briefings. Activates when users mention tracking topics, staying informed, newsletters, or content monitoring.
---

# Topic Tracking

Help users discover and track topics that matter to them. Protime automatically finds relevant content sources (newsletters, RSS feeds, YouTube channels, news) and delivers curated briefings on their schedule.

## Overview

```
User says topic → Discover & refine → Find sources → Create briefing → Daily updates
```

**Standalone mode**: Create briefings with manual topic input
**Enhanced mode**: Smart discovery finds 10-30 sources automatically per topic

## When to Activate

- User mentions wanting to stay informed on a topic
- User asks about newsletters, RSS feeds, or content sources
- User wants to monitor competitors, industries, or trends
- User says "track", "follow", "monitor", "keep me updated", "stay on top of"

## Workflow

### Setting Up a New Topic

1. Ask what topic the user wants to track
2. Use `discover_topics` to refine from broad to specific
3. Present sub-topics and let the user choose
4. Use `discover_sources` to find content sources automatically
5. Show what was found (newsletters, RSS, YouTube, etc.)
6. Ask about schedule (daily, weekly) and preferred delivery time
7. Use `create_briefing_from_discovery` to create the briefing
8. Confirm setup and expected first delivery

### Managing Existing Topics

- List briefings: `get_briefings`
- View config: `get_briefing_config` with briefingId
- Add sources: `add_sources` with briefingId and URLs
- Pause/resume: `update_briefing` with active true/false
- Select active: `select_briefings` with array of briefingIds
- Remove: `delete_briefing` with briefingId

### Adding Sources Manually

When users share a URL they already read:
1. Identify which briefing the source belongs to
2. Use `add_sources` to append it
3. Confirm it was added and will be included in the next briefing

## Key Principles

- Discovery is the core value — users should not have to search for sources
- Sources improve over time as Protime learns what's relevant
- Always confirm before creating or deleting briefings
- Be specific about when the next briefing will arrive
- Free tier: 1 briefing, Pro: unlimited

## Related Commands

- `/protime:discover` — Full guided discovery flow
- `/protime:briefing` — View latest briefing content
- `/protime:search` — Search across all briefing history
