// Tool Router - Routes tool calls to appropriate handlers

import { User } from '../types/user.js';
import { ValidationError } from '../utils/errors.js';
import {
  CreateBriefingSchema,
  GetBriefingsSchema,
  GetBriefingConfigSchema,
  UpdateBriefingSchema,
  GetEditionsSchema,
  GetEditionContentSchema,
  SuggestSourcesSchema,
  DeleteBriefingSchema,
} from '../schemas/tools.js';

// Import handlers
import {
  createBriefing,
  getBriefings,
  getBriefingConfig,
  updateBriefing,
  deleteBriefing,
} from './briefings.js';
import { getEditions, getEditionContent } from './editions.js';
import { suggestSources } from './sources.js';
import {
  discoverTopics,
  discoverSources,
  createBriefingFromDiscovery,
} from './discovery.js';

export async function handleToolCall(
  toolName: string,
  input: any,
  user: User
): Promise<any> {
  switch (toolName) {
    // Discovery Tools (ChatGPT Onboarding Flow)
    case 'discover_topics': {
      const result = await discoverTopics(user, input.topics, {
        regions: input.regions,
        refinementLevel: input.refinementLevel,
        customKeywords: input.customKeywords,
        sessionId: input.sessionId,
      });
      return result;
    }

    case 'discover_sources': {
      const result = await discoverSources(user, input.sessionId);
      return result;
    }

    case 'create_briefing_from_discovery': {
      const result = await createBriefingFromDiscovery(user, input.sessionId, {
        title: input.title,
        schedule: input.schedule,
        deliveryEmail: input.deliveryEmail,
      });
      return result;
    }

    // Legacy Tools (Original MCP Server)
    case 'create_briefing': {
      const validated = CreateBriefingSchema.parse(input);
      const briefing = await createBriefing(user, validated);
      return {
        briefing: {
          id: briefing.id,
          topic: briefing.topic,
          description: briefing.description,
          schedule: briefing.schedule,
          active: briefing.active,
          createdAt: briefing.createdAt.toISOString(),
        },
        message: `Briefing created! I'll start collecting content about "${briefing.topic}". Your first briefing will be ready ${getNextBriefingMessage(briefing.schedule)}.`,
      };
    }

    case 'get_briefings': {
      const validated = GetBriefingsSchema.parse(input);
      const briefings = await getBriefings(user, validated.limit, validated.offset);
      return {
        briefings: briefings.map(b => ({
          id: b.id,
          topic: b.topic,
          description: b.description,
          schedule: b.schedule,
          active: b.active,
          sourceCount: b.sources.length,
          lastRunAt: b.lastRunAt?.toISOString(),
        })),
        total: briefings.length,
      };
    }

    case 'get_briefing_config': {
      const validated = GetBriefingConfigSchema.parse(input);
      const config = await getBriefingConfig(user, validated.briefingId);
      return { config };
    }

    case 'update_briefing': {
      const validated = UpdateBriefingSchema.parse(input);
      await updateBriefing(user, validated.briefingId, validated.settings);
      return {
        success: true,
        message: 'Briefing updated successfully',
      };
    }

    case 'get_editions': {
      const validated = GetEditionsSchema.parse(input);
      const editions = await getEditions(user, validated.briefingId, validated.limit);
      return { editions };
    }

    case 'get_edition_content': {
      const validated = GetEditionContentSchema.parse(input);
      const content = await getEditionContent(user, validated.editionId);
      return { content };
    }

    case 'suggest_sources': {
      const validated = SuggestSourcesSchema.parse(input);
      const sources = await suggestSources(validated.topic, validated.limit);
      return {
        sources,
        message: `Found ${sources.length} recommended sources for "${validated.topic}". Add them to your briefing to start tracking.`,
      };
    }

    case 'delete_briefing': {
      const validated = DeleteBriefingSchema.parse(input);
      await deleteBriefing(user, validated.briefingId);
      return {
        success: true,
        message: 'Briefing deleted successfully',
      };
    }

    default:
      throw new ValidationError(`Unknown tool: ${toolName}`);
  }
}

function getNextBriefingMessage(schedule: string): string {
  const now = new Date();
  switch (schedule) {
    case 'daily':
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(8, 0, 0, 0);
      return `tomorrow at ${tomorrow.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })}`;
    case 'weekly':
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return `next ${nextWeek.toLocaleDateString('en-US', { weekday: 'long' })}`;
    case 'monthly':
      return 'at the end of this month';
    default:
      return 'soon';
  }
}
