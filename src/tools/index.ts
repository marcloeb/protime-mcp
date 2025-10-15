// MCP Tool Definitions

import { Tool } from '../types/mcp.js';

export const tools: Tool[] = [
  // Discovery Tools (ChatGPT Onboarding Flow)
  {
    name: 'discover_topics',
    description:
      'Discover and refine topics for a briefing based on user interests. Supports multi-round refinement (0-3 levels) to progressively narrow down from broad categories to hyper-specific topics. This is Step 1 of the ChatGPT onboarding flow.',
    inputSchema: {
      type: 'object',
      properties: {
        topics: {
          type: 'array',
          items: { type: 'string' },
          description: 'Initial topics or refinement selections (e.g., ["AI Safety", "Startups", "Climate Tech"])',
          minItems: 1,
        },
        regions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional geographic focus (e.g., ["Switzerland", "Germany", "Bay Area"])',
        },
        refinementLevel: {
          type: 'number',
          description: 'Refinement round (0=initial broad topics, 1=specific, 2=very specific, 3=hyper-specific keywords)',
          minimum: 0,
          maximum: 3,
        },
        customKeywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional specific keywords or niche topics to include',
        },
        sessionId: {
          type: 'string',
          description: 'Optional: reuse existing discovery session for further refinement',
        },
      },
      required: ['topics'],
    },
  },
  {
    name: 'discover_sources',
    description:
      'Auto-discover content sources (newsletters, RSS feeds, YouTube channels, Google Search queries) based on topics from a discovery session. This is Step 2 of the ChatGPT onboarding flow. Returns a summary of discovered sources.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The discovery session ID from discover_topics',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'create_briefing_from_discovery',
    description:
      'Create a complete briefing from a discovery session with all discovered sources configured automatically. This is the final step (Step 3) of the ChatGPT onboarding flow. Returns the created briefing with schedule, sources, and delivery settings.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The discovery session ID from discover_topics',
        },
        title: {
          type: 'string',
          description: 'Optional custom title for the briefing (defaults to topic-based title)',
          maxLength: 100,
        },
        schedule: {
          type: 'object',
          properties: {
            frequency: {
              type: 'string',
              enum: ['Daily', 'Weekly', 'Every 2 Days', 'Every 3 Days', 'Every 2 Weeks', 'Monthly'],
              description: 'How often to generate and send the briefing',
            },
            time: {
              type: 'string',
              description: 'Time to send briefing in HH:MM format (e.g., "09:00", "18:30")',
              pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
            },
            weekday: {
              type: 'string',
              enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
              description: 'For weekly schedules: which day to send',
            },
          },
        },
        deliveryEmail: {
          type: 'string',
          format: 'email',
          description: 'Optional: email address for briefing delivery (defaults to user\'s primary email)',
        },
      },
      required: ['sessionId'],
    },
  },
  // Legacy Tools (Original MCP Server)
  {
    name: 'create_briefing',
    description:
      'Create a new topic briefing to automatically track updates and receive AI-powered summaries. Perfect for staying informed on specific subjects without manual effort.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description:
            'The topic to track (e.g., "AI regulations", "climate tech", "competitor analysis")',
          minLength: 3,
          maxLength: 100,
        },
        description: {
          type: 'string',
          description:
            'Optional context about what aspects to focus on or specific interests',
          maxLength: 500,
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'get_briefings',
    description:
      "List all the user's active briefings with basic information about each topic being tracked.",
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of briefings to return (1-50)',
          minimum: 1,
          maximum: 50,
          default: 10,
        },
        offset: {
          type: 'number',
          description: 'Number of briefings to skip for pagination',
          minimum: 0,
          default: 0,
        },
      },
    },
  },
  {
    name: 'get_briefing_config',
    description:
      'Get detailed configuration for a specific briefing including sources, schedule, categories, and statistics.',
    inputSchema: {
      type: 'object',
      properties: {
        briefingId: {
          type: 'string',
          description: 'The unique ID of the briefing',
          format: 'uuid',
        },
      },
      required: ['briefingId'],
    },
  },
  {
    name: 'update_briefing',
    description:
      'Modify a briefing\'s sources, schedule, categories, or active status. Use this to add/remove newsletters, change update frequency, or pause tracking.',
    inputSchema: {
      type: 'object',
      properties: {
        briefingId: {
          type: 'string',
          description: 'The unique ID of the briefing to update',
          format: 'uuid',
        },
        settings: {
          type: 'object',
          properties: {
            schedule: {
              type: 'string',
              enum: ['daily', 'weekly', 'monthly'],
              description: 'How often to generate new briefings',
            },
            sources: {
              type: 'array',
              items: {
                type: 'string',
                format: 'uri',
              },
              description: 'List of newsletter or RSS feed URLs to track',
            },
            categories: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Content categories to organize summaries (e.g., "Product", "Sales", "Research")',
            },
            active: {
              type: 'boolean',
              description: 'Whether this briefing is actively generating updates',
            },
          },
          additionalProperties: false,
        },
      },
      required: ['briefingId', 'settings'],
    },
  },
  {
    name: 'get_editions',
    description:
      'Fetch past briefing editions (historical updates). Each edition represents one scheduled generation of summaries.',
    inputSchema: {
      type: 'object',
      properties: {
        briefingId: {
          type: 'string',
          description: 'The unique ID of the briefing',
          format: 'uuid',
        },
        limit: {
          type: 'number',
          description: 'Number of editions to return (1-30)',
          minimum: 1,
          maximum: 30,
          default: 10,
        },
      },
      required: ['briefingId'],
    },
  },
  {
    name: 'get_edition_content',
    description:
      'Read a specific briefing edition with full summaries organized by category. This shows the actual content of the briefing.',
    inputSchema: {
      type: 'object',
      properties: {
        editionId: {
          type: 'string',
          description: 'The unique ID of the edition to read',
          format: 'uuid',
        },
      },
      required: ['editionId'],
    },
  },
  {
    name: 'suggest_sources',
    description:
      'Get curated newsletter and RSS feed recommendations for a topic. Returns high-quality sources relevant to the subject.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'The topic to find sources for',
          minLength: 3,
          maxLength: 100,
        },
        limit: {
          type: 'number',
          description: 'Number of recommendations to return (1-20)',
          minimum: 1,
          maximum: 20,
          default: 5,
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'delete_briefing',
    description:
      'Permanently delete a briefing and stop tracking the topic. This also removes all historical editions.',
    inputSchema: {
      type: 'object',
      properties: {
        briefingId: {
          type: 'string',
          description: 'The unique ID of the briefing to delete',
          format: 'uuid',
        },
      },
      required: ['briefingId'],
    },
  },
];

export default tools;
