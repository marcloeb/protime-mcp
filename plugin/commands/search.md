---
description: Search across all your briefings for a specific topic or keyword
argument-hint: [keyword to search for]
---

# /search

Search across all your briefing editions to find articles, insights, and trends on a specific topic. Your AI secretary has been reading everything — now ask it what it found.

## Usage

```
/protime:search EU AI Act
/protime:search competitor pricing
/protime:search "Series B funding"
```

## How It Works

```
┌─────────────────────────────────────────────┐
│              STANDALONE                      │
│  • Full-text search across all briefings    │
│  • Returns matching articles with context   │
│  • Shows source, date, and category         │
├─────────────────────────────────────────────┤
│            WITH CHAT                         │
│  + Ask follow-up questions about results    │
│  + "What does this mean for my business?"   │
│  + "Summarize the trend over the last week" │
└─────────────────────────────────────────────┘
```

## Instructions

1. Call `search_briefing_content` with the user's keyword
2. If results are found, present them grouped by briefing topic
3. If too many results, ask the user to narrow down (specific briefing or date range)
4. If the user wants to dig deeper into a result, use `chat_with_content` with the relevant briefingId and editionId
5. If no results, suggest the user check their active briefings or discover new topics

## Output Format

```
Found [count] matches for "[keyword]":

[Briefing Topic] — [Date]
  • [Article title]
    [Short excerpt with keyword highlighted]
    Source: [source name] | [category]

[Briefing Topic] — [Date]
  • [Article title]
    [Short excerpt]
    Source: [source name] | [category]
```

## Guidelines

- Show the most recent matches first
- Include enough context (2-3 sentences) so the user can decide if it's relevant
- If there are many matches, group by briefing and show counts
- Offer to chat about specific results for deeper analysis

## Tips

- Combine with `/protime:briefing` to get today's overview first, then search for details
- Use specific phrases in quotes for exact matches
- Ask "What should I do about [keyword]?" after searching to get action recommendations
