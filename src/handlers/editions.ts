// Edition Handlers - Business logic for viewing briefing editions
// Editions are stored as subcollections: users/{userId}/briefings/{briefingId}/editions/{editionId}

import { userBriefings, userEditions } from '../api/firebase.js';
import {
  Edition,
  EditionContent,
  CategorySummary,
} from '../types/briefing.js';
import { User, FREE_TIER_LIMITS, PRO_TIER_LIMITS } from '../types/user.js';
import {
  NotFoundError,
  TierLimitError,
} from '../utils/errors.js';
import logger from '../utils/logger.js';

export async function getEditions(
  user: User,
  briefingId: string,
  limit: number = 10
): Promise<Edition[]> {
  logger.debug('Fetching editions', { briefingId, userId: user.id, limit });

  // Verify briefing exists (ownership is implicit via subcollection path)
  const briefingDoc = await userBriefings(user.id).doc(briefingId).get();
  if (!briefingDoc.exists) {
    throw new NotFoundError('Briefing');
  }

  // Check tier limits for edition history
  const limits = user.tier === 'free' ? FREE_TIER_LIMITS : PRO_TIER_LIMITS;
  const effectiveLimit = Math.min(limit, limits.maxEditionHistory);

  if (limit > effectiveLimit && user.tier === 'free') {
    logger.info('Edition history limited by tier', {
      userId: user.id,
      requested: limit,
      allowed: effectiveLimit,
    });
  }

  // Fetch editions from subcollection
  const snapshot = await userEditions(user.id, briefingId)
    .orderBy('generatedAt', 'desc')
    .limit(effectiveLimit)
    .get();

  const editions: Edition[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      briefingId,
      generatedAt: data.generatedAt?.toDate ? data.generatedAt.toDate() : new Date(data.generatedAt),
      status: data.status || 'completed',
      summaryCount: data.summaryCount || data.articleCount || 0,
      tokenUsage: data.tokenUsage || 0,
    };
  });

  logger.debug('Fetched editions', {
    count: editions.length,
    briefingId,
  });

  return editions;
}

export async function getEditionContent(
  user: User,
  editionId: string,
  briefingId?: string
): Promise<EditionContent> {
  logger.debug('Fetching edition content', { editionId, userId: user.id, briefingId });

  // If briefingId is provided, use direct subcollection path
  if (briefingId) {
    const editionDoc = await userEditions(user.id, briefingId).doc(editionId).get();

    if (!editionDoc.exists) {
      throw new NotFoundError('Edition');
    }

    return buildEditionContent(editionDoc.id, briefingId, editionDoc.data()!);
  }

  // Without briefingId, we need to search across all briefings
  // First get all user briefings, then check each for the edition
  const briefingsSnapshot = await userBriefings(user.id)
    .where('archived', '==', false)
    .get();

  for (const briefingDoc of briefingsSnapshot.docs) {
    const editionDoc = await userEditions(user.id, briefingDoc.id).doc(editionId).get();
    if (editionDoc.exists) {
      return buildEditionContent(editionDoc.id, briefingDoc.id, editionDoc.data()!);
    }
  }

  throw new NotFoundError('Edition');
}

function buildEditionContent(
  editionId: string,
  briefingId: string,
  data: FirebaseFirestore.DocumentData
): EditionContent {
  const edition: Edition = {
    id: editionId,
    briefingId,
    generatedAt: data.generatedAt?.toDate ? data.generatedAt.toDate() : new Date(data.generatedAt),
    status: data.status || 'completed',
    summaryCount: data.summaryCount || data.articleCount || 0,
    tokenUsage: data.tokenUsage || 0,
  };

  const categories: CategorySummary[] = data.categories || [];

  return {
    id: editionId,
    briefingId,
    edition,
    categories: categories.map((cat: any) => ({
      category: cat.category || cat.name,
      count: cat.summaries?.length || cat.articles?.length || 0,
      summaries: (cat.summaries || cat.articles || []).map((summary: any) => ({
        id: summary.id,
        title: summary.title,
        content: summary.content || summary.summary,
        source: summary.source,
        url: summary.url || summary.link,
        publishedAt: summary.publishedAt
          ? new Date(summary.publishedAt)
          : undefined,
        tags: summary.tags || [],
      })),
    })),
    rawContent: data.rawContent || data.htmlContent,
  };
}
