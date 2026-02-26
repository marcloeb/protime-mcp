// MCP Server Factory — creates a configured McpServer with all tools registered
// Uses the official @modelcontextprotocol/sdk v1

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { User } from "./types/user.js";
import logger from "./utils/logger.js";

// Import existing handlers
import {
  discoverTopics,
  discoverSources,
  createBriefingFromDiscovery,
} from "./handlers/discovery.js";
import {
  createBriefing,
  getBriefings,
  getBriefingConfig,
  updateBriefing,
  deleteBriefing,
} from "./handlers/briefings.js";
import { getEditions, getEditionContent } from "./handlers/editions.js";
import { suggestSources } from "./handlers/sources.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Standard MCP content wrapper for JSON results. */
function jsonContent(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/** Standard MCP error content wrapper. */
function errorContent(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

/** Guard that returns the authenticated user or an error payload. */
function requireUser(getUser: () => User | null): User | null {
  const user = getUser();
  if (!user) return null;
  return user;
}

/**
 * Resolve the firebaseUid for a user.
 * Discovery handlers reference user.firebaseUid; fall back to user.id.
 */
function withFirebaseUid(user: User): User {
  if (!user.firebaseUid) {
    return { ...user, firebaseUid: user.id };
  }
  return user;
}

// ---------------------------------------------------------------------------
// Server Factory
// ---------------------------------------------------------------------------

/**
 * Create and return a fully-configured McpServer instance.
 *
 * @param getUser - Callback that returns the currently authenticated user,
 *                  or null when no user is authenticated. The MCP SDK does
 *                  not handle authentication itself, so we inject it here.
 */
export function createMcpServer(getUser: () => User | null): McpServer {
  const server = new McpServer({
    name: "protime-briefings",
    version: "1.0.0",
  });

  // =========================================================================
  // Discovery Flow (3 tools)
  // =========================================================================

  // @ts-expect-error — Zod-to-JSON inference hits depth limit with complex schemas; runtime works correctly
  server.tool(
    "discover_topics",
    "Discover and refine topics for a briefing based on user interests. Supports multi-round refinement (0-3 levels) to progressively narrow down from broad categories to hyper-specific topics. This is Step 1 of the ChatGPT onboarding flow.",
    {
      topics: z
        .array(z.string())
        .min(1)
        .describe(
          'Initial topics or refinement selections (e.g., ["AI Safety", "Startups", "Climate Tech"])'
        ),
      regions: z
        .array(z.string())
        .optional()
        .describe(
          'Optional geographic focus (e.g., ["Switzerland", "Germany", "Bay Area"])'
        ),
      refinementLevel: z
        .number()
        .min(0)
        .max(3)
        .optional()
        .describe(
          "Refinement round (0=initial broad topics, 1=specific, 2=very specific, 3=hyper-specific keywords)"
        ),
      customKeywords: z
        .array(z.string())
        .optional()
        .describe("Additional specific keywords or niche topics to include"),
      sessionId: z
        .string()
        .optional()
        .describe("Optional: reuse existing discovery session for further refinement"),
    },
    async (args) => {
      const user = requireUser(getUser);
      if (!user) return errorContent("Not authenticated");

      try {
        const result = await discoverTopics(withFirebaseUid(user), args.topics, {
          regions: args.regions,
          refinementLevel: args.refinementLevel,
          customKeywords: args.customKeywords,
          sessionId: args.sessionId,
        });
        return jsonContent(result);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("discover_topics failed", { error: message, userId: user.id });
        return errorContent(`Failed to discover topics: ${message}`);
      }
    }
  );

  server.tool(
    "discover_sources",
    "Auto-discover content sources (newsletters, RSS feeds, YouTube channels, Google Search queries) based on topics from a discovery session. This is Step 2 of the ChatGPT onboarding flow. Returns a summary of discovered sources.",
    {
      sessionId: z.string().describe("The discovery session ID from discover_topics"),
    },
    async (args) => {
      const user = requireUser(getUser);
      if (!user) return errorContent("Not authenticated");

      try {
        const result = await discoverSources(withFirebaseUid(user), args.sessionId);
        return jsonContent(result);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("discover_sources failed", { error: message, userId: user.id });
        return errorContent(`Failed to discover sources: ${message}`);
      }
    }
  );

  // @ts-expect-error — Zod-to-JSON inference hits depth limit with complex schemas; runtime works correctly
  server.tool(
    "create_briefing_from_discovery",
    "Create a complete briefing from a discovery session with all discovered sources configured automatically. This is the final step (Step 3) of the ChatGPT onboarding flow. Returns the created briefing with schedule, sources, and delivery settings.",
    {
      sessionId: z.string().describe("The discovery session ID from discover_topics"),
      title: z
        .string()
        .max(100)
        .optional()
        .describe("Optional custom title for the briefing (defaults to topic-based title)"),
      schedule: z
        .object({
          frequency: z
            .enum([
              "Daily",
              "Weekly",
              "Every 2 Days",
              "Every 3 Days",
              "Every 2 Weeks",
              "Monthly",
            ])
            .optional()
            .describe("How often to generate and send the briefing"),
          time: z
            .string()
            .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
            .optional()
            .describe('Time to send briefing in HH:MM format (e.g., "09:00", "18:30")'),
          weekday: z
            .enum([
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
              "Sunday",
            ])
            .optional()
            .describe("For weekly schedules: which day to send"),
        })
        .optional()
        .describe("Schedule configuration for the briefing"),
      deliveryEmail: z
        .string()
        .email()
        .optional()
        .describe(
          "Optional: email address for briefing delivery (defaults to user's primary email)"
        ),
    },
    async (args) => {
      const user = requireUser(getUser);
      if (!user) return errorContent("Not authenticated");

      try {
        const result = await createBriefingFromDiscovery(
          withFirebaseUid(user),
          args.sessionId,
          {
            title: args.title,
            schedule: args.schedule,
            deliveryEmail: args.deliveryEmail,
          }
        );
        return jsonContent(result);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("create_briefing_from_discovery failed", {
          error: message,
          userId: user.id,
        });
        return errorContent(`Failed to create briefing from discovery: ${message}`);
      }
    }
  );

  // =========================================================================
  // Briefing Management (5 tools)
  // =========================================================================

  server.tool(
    "create_briefing",
    "Create a new topic briefing to automatically track updates and receive AI-powered summaries. Perfect for staying informed on specific subjects without manual effort.",
    {
      topic: z
        .string()
        .min(3)
        .max(100)
        .describe(
          'The topic to track (e.g., "AI regulations", "climate tech", "competitor analysis")'
        ),
      description: z
        .string()
        .max(500)
        .optional()
        .describe(
          "Optional context about what aspects to focus on or specific interests"
        ),
    },
    async (args) => {
      const user = requireUser(getUser);
      if (!user) return errorContent("Not authenticated");

      try {
        const briefing = await createBriefing(user, {
          topic: args.topic,
          description: args.description,
        });
        return jsonContent({
          briefing: {
            id: briefing.id,
            topic: briefing.topic,
            description: briefing.description,
            schedule: briefing.schedule,
            active: briefing.active,
            createdAt: briefing.createdAt.toISOString(),
          },
          message: `Briefing created! I'll start collecting content about "${briefing.topic}". Your first briefing will be ready ${getNextBriefingMessage(briefing.schedule)}.`,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("create_briefing failed", { error: message, userId: user.id });
        return errorContent(`Failed to create briefing: ${message}`);
      }
    }
  );

  // @ts-expect-error — Zod-to-JSON inference hits depth limit with complex schemas; runtime works correctly
  server.tool(
    "get_briefings",
    "List all the user's active briefings with basic information about each topic being tracked.",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe("Maximum number of briefings to return (1-50)"),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe("Number of briefings to skip for pagination"),
    },
    async (args) => {
      const user = requireUser(getUser);
      if (!user) return errorContent("Not authenticated");

      try {
        const briefings = await getBriefings(user, args.limit, args.offset);
        return jsonContent({
          briefings: briefings.map((b) => ({
            id: b.id,
            topic: b.topic,
            description: b.description,
            schedule: b.schedule,
            active: b.active,
            sourceCount: b.sources.length,
            lastRunAt: b.lastRunAt?.toISOString(),
          })),
          total: briefings.length,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("get_briefings failed", { error: message, userId: user.id });
        return errorContent(`Failed to fetch briefings: ${message}`);
      }
    }
  );

  server.tool(
    "get_briefing_config",
    "Get detailed configuration for a specific briefing including sources, schedule, categories, and statistics.",
    {
      briefingId: z.string().describe("The unique ID of the briefing"),
    },
    async (args) => {
      const user = requireUser(getUser);
      if (!user) return errorContent("Not authenticated");

      try {
        const config = await getBriefingConfig(user, args.briefingId);
        return jsonContent({ config });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("get_briefing_config failed", {
          error: message,
          userId: user.id,
        });
        return errorContent(`Failed to fetch briefing config: ${message}`);
      }
    }
  );

  // @ts-expect-error — Zod-to-JSON inference hits depth limit with complex schemas; runtime works correctly
  server.tool(
    "update_briefing",
    "Modify a briefing's sources, schedule, categories, or active status. Use this to add/remove newsletters, change update frequency, or pause tracking.",
    {
      briefingId: z.string().describe("The unique ID of the briefing to update"),
      settings: z
        .object({
          schedule: z
            .enum(["daily", "weekly", "monthly"])
            .optional()
            .describe("How often to generate new briefings"),
          sources: z
            .array(z.string().url())
            .optional()
            .describe("List of newsletter or RSS feed URLs to track"),
          categories: z
            .array(z.string())
            .optional()
            .describe(
              'Content categories to organize summaries (e.g., "Product", "Sales", "Research")'
            ),
          active: z
            .boolean()
            .optional()
            .describe("Whether this briefing is actively generating updates"),
        })
        .describe("Settings to update on the briefing"),
    },
    async (args) => {
      const user = requireUser(getUser);
      if (!user) return errorContent("Not authenticated");

      try {
        await updateBriefing(user, args.briefingId, args.settings);
        return jsonContent({
          success: true,
          message: "Briefing updated successfully",
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("update_briefing failed", { error: message, userId: user.id });
        return errorContent(`Failed to update briefing: ${message}`);
      }
    }
  );

  server.tool(
    "delete_briefing",
    "Permanently delete a briefing and stop tracking the topic. This also removes all historical editions.",
    {
      briefingId: z.string().describe("The unique ID of the briefing to delete"),
    },
    async (args) => {
      const user = requireUser(getUser);
      if (!user) return errorContent("Not authenticated");

      try {
        await deleteBriefing(user, args.briefingId);
        return jsonContent({
          success: true,
          message: "Briefing deleted successfully",
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("delete_briefing failed", { error: message, userId: user.id });
        return errorContent(`Failed to delete briefing: ${message}`);
      }
    }
  );

  // =========================================================================
  // Content Retrieval (2 tools)
  // =========================================================================

  server.tool(
    "get_editions",
    "Fetch past briefing editions (historical updates). Each edition represents one scheduled generation of summaries.",
    {
      briefingId: z.string().describe("The unique ID of the briefing"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .default(10)
        .describe("Number of editions to return (1-30)"),
    },
    async (args) => {
      const user = requireUser(getUser);
      if (!user) return errorContent("Not authenticated");

      try {
        const editions = await getEditions(user, args.briefingId, args.limit);
        return jsonContent({ editions });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("get_editions failed", { error: message, userId: user.id });
        return errorContent(`Failed to fetch editions: ${message}`);
      }
    }
  );

  server.tool(
    "get_edition_content",
    "Read a specific briefing edition with full summaries organized by category. This shows the actual content of the briefing.",
    {
      editionId: z.string().describe("The unique ID of the edition to read"),
    },
    async (args) => {
      const user = requireUser(getUser);
      if (!user) return errorContent("Not authenticated");

      try {
        const content = await getEditionContent(user, args.editionId);
        return jsonContent({ content });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("get_edition_content failed", {
          error: message,
          userId: user.id,
        });
        return errorContent(`Failed to fetch edition content: ${message}`);
      }
    }
  );

  // =========================================================================
  // Source Discovery (1 tool)
  // =========================================================================

  server.tool(
    "suggest_sources",
    "Get curated newsletter and RSS feed recommendations for a topic. Returns high-quality sources relevant to the subject.",
    {
      topic: z
        .string()
        .min(3)
        .max(100)
        .describe("The topic to find sources for"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .default(5)
        .describe("Number of recommendations to return (1-20)"),
    },
    async (args) => {
      // suggest_sources does not require authentication
      try {
        const sources = await suggestSources(args.topic, args.limit);
        return jsonContent({
          sources,
          message: `Found ${sources.length} recommended sources for "${args.topic}". Add them to your briefing to start tracking.`,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("suggest_sources failed", { error: message });
        return errorContent(`Failed to suggest sources: ${message}`);
      }
    }
  );

  // =========================================================================
  // NEW Tools (3)
  // =========================================================================

  // @ts-expect-error — Zod-to-JSON inference hits depth limit with complex schemas; runtime works correctly
  server.tool(
    "get_briefing_summary",
    "Get the latest edition for a briefing formatted as a concise summary. Supports 'short' (3 bullet points), 'detailed' (full categories with articles), and 'bullets' (all articles as bullet points) formats.",
    {
      briefingId: z.string().describe("The unique ID of the briefing"),
      format: z
        .enum(["short", "detailed", "bullets"])
        .optional()
        .default("short")
        .describe(
          "Summary format: 'short' = 3 bullet points, 'detailed' = full categories, 'bullets' = all articles as bullets"
        ),
    },
    async (args) => {
      const user = requireUser(getUser);
      if (!user) return errorContent("Not authenticated");

      try {
        // Get the latest edition
        const editions = await getEditions(user, args.briefingId, 1);
        if (editions.length === 0) {
          return jsonContent({
            summary: null,
            message:
              "No editions available yet for this briefing. The first edition will be generated on the next scheduled run.",
          });
        }

        const latestEdition = editions[0];
        const content = await getEditionContent(user, latestEdition.id);

        // Format based on requested format
        const summary = formatBriefingSummary(content, args.format);
        return jsonContent({
          briefingId: args.briefingId,
          editionId: latestEdition.id,
          generatedAt: latestEdition.generatedAt,
          format: args.format,
          summary,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("get_briefing_summary failed", {
          error: message,
          userId: user.id,
        });
        return errorContent(`Failed to get briefing summary: ${message}`);
      }
    }
  );

  server.tool(
    "search_briefing_content",
    "Search across briefing edition content by keyword. Returns matching articles with briefing name, category, and relevance context.",
    {
      keyword: z
        .string()
        .min(2)
        .describe("The keyword or phrase to search for in briefing content"),
      briefingId: z
        .string()
        .optional()
        .describe(
          "Optional: limit search to a specific briefing. If omitted, searches all briefings."
        ),
      maxEditions: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .default(3)
        .describe("Maximum number of recent editions to search per briefing (1-10)"),
    },
    async (args) => {
      const user = requireUser(getUser);
      if (!user) return errorContent("Not authenticated");

      try {
        // Get user's briefings (or just the specified one)
        let briefings;
        if (args.briefingId) {
          const config = await getBriefingConfig(user, args.briefingId);
          briefings = [{ id: config.briefingId, topic: config.topic }];
        } else {
          const allBriefings = await getBriefings(user, 50, 0);
          briefings = allBriefings.map((b) => ({ id: b.id, topic: b.topic }));
        }

        const keywordLower = args.keyword.toLowerCase();
        const matches: Array<{
          briefingId: string;
          briefingTopic: string;
          editionId: string;
          generatedAt: string;
          category: string;
          articleTitle: string;
          articleContent: string;
          source: string;
          url?: string;
        }> = [];

        for (const briefing of briefings) {
          const editions = await getEditions(user, briefing.id, args.maxEditions);

          for (const edition of editions) {
            const content = await getEditionContent(user, edition.id);

            for (const category of content.categories) {
              for (const article of category.summaries) {
                const titleMatch = article.title
                  .toLowerCase()
                  .includes(keywordLower);
                const contentMatch = article.content
                  .toLowerCase()
                  .includes(keywordLower);

                if (titleMatch || contentMatch) {
                  matches.push({
                    briefingId: briefing.id,
                    briefingTopic: briefing.topic,
                    editionId: edition.id,
                    generatedAt: edition.generatedAt.toISOString(),
                    category: category.category,
                    articleTitle: article.title,
                    articleContent: article.content,
                    source: article.source?.name || "Unknown",
                    url: article.url,
                  });
                }
              }
            }
          }
        }

        return jsonContent({
          keyword: args.keyword,
          totalMatches: matches.length,
          matches,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("search_briefing_content failed", {
          error: message,
          userId: user.id,
        });
        return errorContent(`Failed to search briefing content: ${message}`);
      }
    }
  );

  server.tool(
    "chat_with_content",
    "Ask a question about a specific briefing edition's content. Uses AI to analyze the briefing content and provide an informed answer. Proxies to the Protime chat API.",
    {
      briefingId: z
        .string()
        .describe("The briefing ID whose content to chat about"),
      issueId: z
        .string()
        .describe("The edition/issue ID to use as context for the conversation"),
      question: z
        .string()
        .min(3)
        .describe(
          "The question to ask about the briefing content (e.g., 'What are the key AI trends?', 'Summarize the climate section')"
        ),
    },
    async (args) => {
      const user = requireUser(getUser);
      if (!user) return errorContent("Not authenticated");

      try {
        const appUrl =
          process.env.PROTIME_APP_URL || "https://protime.ai";

        const response = await fetch(`${appUrl}/api/chatWithContent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": user.id,
            "X-User-Email": user.email,
          },
          body: JSON.stringify({
            briefingId: args.briefingId,
            issueId: args.issueId,
            question: args.question,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return errorContent(
            `Chat API returned ${response.status}: ${errorText}`
          );
        }

        const result = await response.json();
        return jsonContent(result);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("chat_with_content failed", {
          error: message,
          userId: user.id,
        });
        return errorContent(`Failed to chat with content: ${message}`);
      }
    }
  );

  // =========================================================================
  // MCP Resources (4)
  // =========================================================================

  // 1. Static resource: list all user briefings
  server.resource(
    "briefings-list",
    "protime://briefings",
    { description: "List all user briefings with id, topic, schedule, source count, and status" },
    async (uri) => {
      const user = requireUser(getUser);
      if (!user) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ error: "Not authenticated" }),
          }],
        };
      }

      try {
        const briefings = await getBriefings(user, 50, 0);
        const data = briefings.map((b) => ({
          id: b.id,
          topic: b.topic,
          schedule: b.schedule,
          sourceCount: b.sources.length,
          active: b.active,
        }));
        return {
          contents: [{
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("resource briefings-list failed", { error: message, userId: user.id });
        return {
          contents: [{
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ error: `Failed to list briefings: ${message}` }),
          }],
        };
      }
    }
  );

  // 2. Resource template: detailed briefing config by ID
  server.resource(
    "briefing-detail",
    new ResourceTemplate("protime://briefings/{briefingId}", { list: undefined }),
    { description: "Detailed briefing configuration including sources, categories, schedule, and delivery settings" },
    async (uri, { briefingId }) => {
      const user = requireUser(getUser);
      if (!user) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ error: "Not authenticated" }),
          }],
        };
      }

      try {
        const config = await getBriefingConfig(user, briefingId as string);
        return {
          contents: [{
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(config, null, 2),
          }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("resource briefing-detail failed", {
          error: message,
          userId: user.id,
          briefingId,
        });
        return {
          contents: [{
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ error: `Briefing not found or access denied: ${message}` }),
          }],
        };
      }
    }
  );

  // 3. Resource template: latest edition content for a briefing
  server.resource(
    "briefing-latest-edition",
    new ResourceTemplate("protime://briefings/{briefingId}/latest", { list: undefined }),
    { description: "The most recent edition content for a briefing, including all categories and article summaries" },
    async (uri, { briefingId }) => {
      const user = requireUser(getUser);
      if (!user) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ error: "Not authenticated" }),
          }],
        };
      }

      try {
        const editions = await getEditions(user, briefingId as string, 1);
        if (editions.length === 0) {
          return {
            contents: [{
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                briefingId,
                edition: null,
                message: "No editions available yet. The first edition will be generated on the next scheduled run.",
              }),
            }],
          };
        }

        const latestEdition = editions[0];
        const content = await getEditionContent(user, latestEdition.id);
        return {
          contents: [{
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({
              briefingId,
              editionId: latestEdition.id,
              generatedAt: latestEdition.generatedAt,
              content,
            }, null, 2),
          }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("resource briefing-latest-edition failed", {
          error: message,
          userId: user.id,
          briefingId,
        });
        return {
          contents: [{
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ error: `Failed to fetch latest edition: ${message}` }),
          }],
        };
      }
    }
  );

  // 4. Static resource: user profile
  server.resource(
    "user-profile",
    "protime://profile",
    { description: "Current user profile including id, email, display name, tier, and account creation date" },
    async (uri) => {
      const user = requireUser(getUser);
      if (!user) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ error: "Not authenticated" }),
          }],
        };
      }

      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            tier: user.tier,
            createdAt: user.createdAt.toISOString(),
          }, null, 2),
        }],
      };
    }
  );

  return server;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Format edition content into a human-readable summary based on format type.
 */
function formatBriefingSummary(
  content: Awaited<ReturnType<typeof getEditionContent>>,
  format: "short" | "detailed" | "bullets"
): string {
  const { categories } = content;

  if (categories.length === 0) {
    return "No content available in this edition.";
  }

  switch (format) {
    case "short": {
      // Pick up to 3 highlights across all categories
      const highlights: string[] = [];
      for (const category of categories) {
        for (const article of category.summaries) {
          if (highlights.length >= 3) break;
          highlights.push(`- ${article.title}: ${truncate(article.content, 120)}`);
        }
        if (highlights.length >= 3) break;
      }
      return highlights.join("\n");
    }

    case "detailed": {
      const sections: string[] = [];
      for (const category of categories) {
        const header = `## ${category.category} (${category.count} articles)`;
        const articles = category.summaries
          .map(
            (a) =>
              `- **${a.title}**\n  ${truncate(a.content, 200)}${a.url ? `\n  [Read more](${a.url})` : ""}`
          )
          .join("\n");
        sections.push(`${header}\n${articles}`);
      }
      return sections.join("\n\n");
    }

    case "bullets": {
      const bullets: string[] = [];
      for (const category of categories) {
        for (const article of category.summaries) {
          bullets.push(
            `- [${category.category}] ${article.title}: ${truncate(article.content, 150)}`
          );
        }
      }
      return bullets.join("\n");
    }

    default:
      return "Unknown format requested.";
  }
}

/** Truncate a string to maxLen characters, appending ellipsis if trimmed. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

/** Produce a human-readable next-run estimate from a schedule string. */
function getNextBriefingMessage(schedule: string): string {
  const now = new Date();
  switch (schedule) {
    case "daily": {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(8, 0, 0, 0);
      return `tomorrow at ${tomorrow.toLocaleTimeString("en-US", { hour: "numeric", hour12: true })}`;
    }
    case "weekly": {
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return `next ${nextWeek.toLocaleDateString("en-US", { weekday: "long" })}`;
    }
    case "monthly":
      return "at the end of this month";
    default:
      return "soon";
  }
}
