# Connectors

This plugin connects to the Protime MCP server to manage topic briefings and content discovery.

## Required

| Connector | Purpose |
|-----------|---------|
| **Protime** | Core briefing management, content discovery, and AI-powered summaries |

The Protime MCP server provides all tools needed for topic tracking, source discovery, briefing management, and content search.

**Endpoint:** `https://mcp.protime.ai/mcp`
**Authentication:** OAuth 2.0 (automatic via Claude)

## Optional Integrations

These connectors enhance the Protime experience when available:

| Connector | Enhancement |
|-----------|-------------|
| Google Calendar | Match briefing content to upcoming meetings |
| Gmail | Use email context for more relevant briefings |
| Slack | Share briefing highlights to team channels |
| Notion | Save important findings to your workspace |

## Setup

The Protime connector activates automatically when you install this plugin. You'll be asked to sign in with your Protime account on first use.

For optional connectors, install them separately from the Claude connector marketplace.
