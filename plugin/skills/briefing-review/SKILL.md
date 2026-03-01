---
name: briefing-review
description: Review, search, and chat about briefing content. Activates when users ask about their briefings, want summaries, or need to find specific information across their tracked topics.
---

# Briefing Review

Help users get the most out of their briefings. Summarize what matters, search for specific topics, and answer questions about the content Protime has collected.

## Overview

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Summary    │     │   Search     │     │    Chat      │
│  Quick view  │────▶│  Find items  │────▶│  Go deeper   │
│  of latest   │     │  by keyword  │     │  ask follow  │
│  briefing    │     │  across all  │     │  up questions │
└──────────────┘     └──────────────┘     └──────────────┘
```

## When to Activate

- User asks "What's in my briefing?" or "What happened today?"
- User wants a summary, overview, or update
- User searches for a specific topic or keyword in their briefings
- User asks questions about content ("What are the trends in X?")
- User says "catch me up", "what did I miss", "anything important?"

## Workflow

### Quick Briefing Check

1. If user has one briefing: get summary directly with `get_briefing_summary`
2. If user has multiple: list briefings with `get_briefings`, ask which one (or show all)
3. Default to "short" format (3 bullet points) unless user asks for detail
4. Highlight urgent items first, then important, then informational

### Deep Dive

1. When user asks about a specific topic, use `search_briefing_content` with keyword
2. Present matches with context (title, excerpt, source, date)
3. If user wants to explore further, use `chat_with_content` with the relevant edition
4. Answer follow-up questions using the briefing content as context

### Historical Review

1. Use `get_editions` to show past briefing editions
2. Use `get_edition_content` to read a specific past edition
3. Help user compare how a topic has evolved over time

## Output Patterns

### Morning briefing check:
```
Good morning. Here's what your secretary found:

[Topic] — [count] items
→ [Urgent item with recommended action]
→ [Important item]
→ [Notable item]

Want the full breakdown or should I search for something specific?
```

### Search results:
```
Found [count] mentions of "[keyword]" across your briefings:

[Most recent first, grouped by briefing topic]
• [Article title] — [date]
  [2-3 sentence excerpt]

Want me to dig deeper into any of these?
```

## Key Principles

- Lead with what's actionable — urgent items with clear next steps
- Keep summaries concise by default, offer detail on request
- When chatting about content, connect dots across different articles and editions
- Always mention the source so the user can verify
- Offer to search or chat as natural follow-ups

## Related Commands

- `/protime:briefing` — Quick briefing overview
- `/protime:search` — Keyword search across all briefings
- `/protime:discover` — Set up new topic tracking
