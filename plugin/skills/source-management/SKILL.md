---
name: source-management
description: Manage content sources for briefings — add URLs, select active briefings, configure schedules. Activates when users mention adding sources, managing subscriptions, or changing briefing settings.
---

# Source Management

Help users manage their briefing sources and settings. Add new content sources, control which briefings are active, and adjust delivery preferences.

## When to Activate

- User shares a URL and wants to add it to a briefing
- User wants to change their briefing schedule or settings
- User wants to pause, resume, or select which briefings are active
- User asks about their sources or wants to see what's being tracked
- User says "add this", "subscribe", "unsubscribe", "change schedule", "pause"

## Workflow

### Adding a Source

When user shares a URL (newsletter, RSS feed, blog):
1. If user has one briefing: add directly with `add_sources`
2. If multiple briefings: ask which one the source belongs to
3. Confirm the source was added and its type (newsletter vs RSS)
4. Mention it will be included in the next briefing generation

### Viewing Sources

1. Use `get_briefing_config` to see all sources for a briefing
2. Present sources grouped by type (newsletter, RSS, gmail)
3. Show which are active and which are disabled

### Selecting Active Briefings

When user wants to control which briefings generate updates:
1. List all briefings with `get_briefings`
2. Ask which ones should be active
3. Use `select_briefings` with the chosen IDs
4. Confirm what was activated and deactivated

### Changing Settings

Use `update_briefing` for:
- Schedule changes (daily, weekly, monthly)
- Activating/deactivating a single briefing
- Updating categories
- Replacing all sources (use `add_sources` to append instead)

## Key Principles

- Adding sources should be frictionless — one URL, done
- Always confirm which briefing a source is being added to
- When deactivating briefings, make clear this pauses updates (not deletes)
- Deleting a briefing is permanent — always confirm before using `delete_briefing`
- Free tier users can only have 1 active briefing — mention upgrade if they hit the limit

## Related Commands

- `/protime:discover` — Automatic source discovery for new topics
- `/protime:briefing` — View what the current sources produce
