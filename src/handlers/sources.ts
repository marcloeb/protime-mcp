// Source Handlers - Business logic for newsletter/RSS discovery

import { Source } from '../types/briefing.js';
import logger from '../utils/logger.js';

// Curated source database (can be moved to Firestore later)
const CURATED_SOURCES: Record<string, Source[]> = {
  'ai': [
    {
      id: 'ai-1',
      type: 'newsletter',
      url: 'https://www.deeplearning.ai/the-batch',
      name: 'The Batch',
      description: 'AI news and insights from Andrew Ng',
      active: true,
    },
    {
      id: 'ai-2',
      type: 'newsletter',
      url: 'https://www.importai.com',
      name: 'Import AI',
      description: 'Weekly AI newsletter by Jack Clark',
      active: true,
    },
    {
      id: 'ai-3',
      type: 'newsletter',
      url: 'https://www.technologyreview.com/topic/artificial-intelligence',
      name: 'MIT Tech Review AI',
      description: 'AI coverage from MIT Technology Review',
      active: true,
    },
    {
      id: 'ai-4',
      type: 'rss',
      url: 'https://openai.com/blog/rss/',
      name: 'OpenAI Blog',
      description: 'Official updates from OpenAI',
      active: true,
    },
    {
      id: 'ai-5',
      type: 'newsletter',
      url: 'https://www.aisnakeoil.com',
      name: 'AI Snake Oil',
      description: 'Critical perspectives on AI hype',
      active: true,
    },
  ],
  'climate': [
    {
      id: 'climate-1',
      type: 'newsletter',
      url: 'https://www.heated.world',
      name: 'Heated',
      description: 'Accountability journalism on climate crisis',
      active: true,
    },
    {
      id: 'climate-2',
      type: 'newsletter',
      url: 'https://www.climatetechvc.substack.com',
      name: 'Climate Tech VC',
      description: 'Climate tech venture capital insights',
      active: true,
    },
    {
      id: 'climate-3',
      type: 'rss',
      url: 'https://www.theverge.com/rss/climate/index.xml',
      name: 'The Verge Climate',
      description: 'Climate tech and policy news',
      active: true,
    },
  ],
  'tech': [
    {
      id: 'tech-1',
      type: 'newsletter',
      url: 'https://www.stratechery.com',
      name: 'Stratechery',
      description: 'Tech strategy analysis by Ben Thompson',
      active: true,
    },
    {
      id: 'tech-2',
      type: 'newsletter',
      url: 'https://www.techmeme.com',
      name: 'Techmeme',
      description: 'Top tech news aggregated',
      active: true,
    },
    {
      id: 'tech-3',
      type: 'rss',
      url: 'https://techcrunch.com/feed/',
      name: 'TechCrunch',
      description: 'Startup and technology news',
      active: true,
    },
  ],
  'startup': [
    {
      id: 'startup-1',
      type: 'newsletter',
      url: 'https://www.lenny.com',
      name: "Lenny's Newsletter",
      description: 'Product and growth insights',
      active: true,
    },
    {
      id: 'startup-2',
      type: 'newsletter',
      url: 'https://www.saastr.com',
      name: 'SaaStr',
      description: 'B2B SaaS insights and tactics',
      active: true,
    },
  ],
  'finance': [
    {
      id: 'finance-1',
      type: 'newsletter',
      url: 'https://www.morningbrew.com',
      name: 'Morning Brew',
      description: 'Daily business news digest',
      active: true,
    },
    {
      id: 'finance-2',
      type: 'newsletter',
      url: 'https://www.bloomberg.com/account/newsletters',
      name: 'Bloomberg',
      description: 'Financial markets and analysis',
      active: true,
    },
  ],
};

// Keywords to category mapping
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  ai: ['ai', 'artificial intelligence', 'machine learning', 'deep learning', 'llm', 'gpt', 'neural'],
  climate: ['climate', 'sustainability', 'carbon', 'renewable', 'green energy', 'environmental'],
  tech: ['technology', 'software', 'hardware', 'computing', 'digital'],
  startup: ['startup', 'entrepreneurship', 'venture', 'founder', 'saas', 'business'],
  finance: ['finance', 'markets', 'investing', 'stocks', 'economy', 'trading'],
};

export async function suggestSources(
  topic: string,
  limit: number = 5
): Promise<Source[]> {
  logger.debug('Suggesting sources', { topic, limit });

  const topicLower = topic.toLowerCase();

  // Find matching categories
  const matchedCategories: string[] = [];
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(keyword => topicLower.includes(keyword))) {
      matchedCategories.push(category);
    }
  }

  // If no matches, try general tech
  if (matchedCategories.length === 0) {
    matchedCategories.push('tech');
  }

  // Collect sources from matched categories
  let sources: Source[] = [];
  for (const category of matchedCategories) {
    if (CURATED_SOURCES[category]) {
      sources.push(...CURATED_SOURCES[category]);
    }
  }

  // Remove duplicates and limit
  const uniqueSources = Array.from(
    new Map(sources.map(s => [s.id, s])).values()
  ).slice(0, limit);

  logger.info('Sources suggested', {
    topic,
    categories: matchedCategories,
    sourceCount: uniqueSources.length,
  });

  return uniqueSources;
}

// Helper function to add new curated sources (for future use)
export function addCuratedSource(category: string, source: Source): void {
  if (!CURATED_SOURCES[category]) {
    CURATED_SOURCES[category] = [];
  }
  CURATED_SOURCES[category].push(source);
  logger.info('Curated source added', { category, sourceName: source.name });
}
