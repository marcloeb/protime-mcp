// Edition Handlers - Business logic for viewing briefing editions

import { collections } from '../api/firebase.js';
import {
  Edition,
  EditionContent,
  CategorySummary,
} from '../types/briefing.js';
import { User, FREE_TIER_LIMITS, PRO_TIER_LIMITS } from '../types/user.js';
import {
  NotFoundError,
  AuthorizationError,
  TierLimitError,
} from '../utils/errors.js';
import logger from '../utils/logger.js';

export async function getEditions(
  user: User,
  briefingId: string,
  limit: number = 10
): Promise<Edition[]> {
  logger.debug('Fetching editions', { briefingId, userId: user.id, limit });

  // Verify briefing ownership
  const briefingDoc = await collections.briefings.doc(briefingId).get();
  if (!briefingDoc.exists) {
    throw new NotFoundError('Briefing');
  }

  const briefing = briefingDoc.data();
  if (briefing!.userId !== user.id) {
    throw new AuthorizationError('You do not have access to this briefing');
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

  // Fetch editions
  const snapshot = await collections.editions
    .where('briefingId', '==', briefingId)
    .where('status', '==', 'completed')
    .orderBy('generatedAt', 'desc')
    .limit(effectiveLimit)
    .get();

  const editions: Edition[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      briefingId: data.briefingId,
      generatedAt: new Date(data.generatedAt),
      status: data.status,
      summaryCount: data.summaryCount || 0,
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
  editionId: string
): Promise<EditionContent> {
  logger.debug('Fetching edition content', { editionId, userId: user.id });

  // Fetch edition
  const editionDoc = await collections.editions.doc(editionId).get();
  if (!editionDoc.exists) {
    throw new NotFoundError('Edition');
  }

  const editionData = editionDoc.data()!;

  // Verify briefing ownership
  const briefingDoc = await collections.briefings
    .doc(editionData.briefingId)
    .get();

  if (!briefingDoc.exists) {
    throw new NotFoundError('Briefing');
  }

  const briefing = briefingDoc.data()!;
  if (briefing.userId !== user.id) {
    throw new AuthorizationError('You do not have access to this edition');
  }

  // Parse edition content
  const edition: Edition = {
    id: editionDoc.id,
    briefingId: editionData.briefingId,
    generatedAt: new Date(editionData.generatedAt),
    status: editionData.status,
    summaryCount: editionData.summaryCount || 0,
    tokenUsage: editionData.tokenUsage || 0,
  };

  // Get categorized summaries
  const categories: CategorySummary[] = editionData.categories || [];

  const content: EditionContent = {
    id: editionDoc.id,
    briefingId: editionData.briefingId,
    edition,
    categories: categories.map((cat: any) => ({
      category: cat.category,
      count: cat.summaries?.length || 0,
      summaries: (cat.summaries || []).map((summary: any) => ({
        id: summary.id,
        title: summary.title,
        content: summary.content,
        source: summary.source,
        url: summary.url,
        publishedAt: summary.publishedAt
          ? new Date(summary.publishedAt)
          : undefined,
        tags: summary.tags || [],
      })),
    })),
    rawContent: editionData.rawContent,
  };

  logger.debug('Fetched edition content', {
    editionId,
    categoryCount: categories.length,
    summaryCount: edition.summaryCount,
  });

  return content;
}
