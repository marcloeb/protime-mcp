---
description: Get your latest briefing summary — what happened, what's important, what to do
argument-hint: [briefing topic or "all"]
---

# /briefing

Get a quick overview of your latest briefing or a detailed breakdown of what your AI secretary found for you.

## Usage

```
/protime:briefing
/protime:briefing AI regulations
/protime:briefing --detailed
```

## How It Works

```
┌─────────────────────────────────────────────┐
│              STANDALONE                      │
│  • List your active briefings               │
│  • Show latest edition summary              │
│  • Highlight urgent and important items     │
├─────────────────────────────────────────────┤
│           WITH CONNECTORS                    │
│  + Google Calendar: match briefing to       │
│    today's meetings                         │
│  + Slack: share key findings to channels    │
│  + Gmail: draft replies based on briefing   │
└─────────────────────────────────────────────┘
```

## Instructions

1. If no argument is provided, list all active briefings using `get_briefings` and ask which one to show
2. If a topic is mentioned, find the matching briefing and get its latest summary
3. If `--detailed` is used, use format "detailed" instead of "short"
4. If `all` is specified, show a short summary of each active briefing

## Output Format

```
Your briefing for [Topic] — [Date]

[count] urgent · [count] important · [count] for your information

Today's highlights:
→ [Most important item with action recommendation]
→ [Second most important item]
→ [Third item]

[If detailed: full category breakdown with articles]
```

## Guidelines

- Lead with what matters most — urgent items first
- Include action recommendations for urgent items
- Keep the short format to 3-5 bullet points
- Use plain language, no marketing speak
- If no editions exist yet, tell the user when the next one will be generated

## Tips

- Use `/protime:briefing --detailed` for the full breakdown before an important meeting
- Use `/protime:search [keyword]` to dig deeper into a specific topic from your briefing
- Use `/protime:discover` to set up new topic tracking
