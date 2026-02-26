// Briefing Handlers - Business logic for briefing operations
// Briefings are stored as subcollections: users/{userId}/briefings/{briefingId}

import { userBriefings } from '../api/firebase.js';
import {
  Briefing,
  CreateBriefingRequest,
  UpdateBriefingRequest,
  BriefingConfig,
} from '../types/briefing.js';
import { User, FREE_TIER_LIMITS, PRO_TIER_LIMITS } from '../types/user.js';
import {
  NotFoundError,
  AuthorizationError,
  TierLimitError,
} from '../utils/errors.js';
import logger from '../utils/logger.js';

export async function createBriefing(
  user: User,
  request: CreateBriefingRequest
): Promise<Briefing> {
  logger.info('Creating briefing', { userId: user.id, topic: request.topic });

  const briefingsRef = userBriefings(user.id);

  // Check tier limits
  const existingBriefings = await briefingsRef
    .where('archived', '==', false)
    .get();

  const limits = user.tier === 'free' ? FREE_TIER_LIMITS : PRO_TIER_LIMITS;

  if (existingBriefings.size >= limits.maxBriefings) {
    throw new TierLimitError(
      `Free tier allows only ${limits.maxBriefings} briefing. Upgrade to Pro for unlimited briefings.`
    );
  }

  // Create briefing
  const briefingRef = briefingsRef.doc();
  const briefingId = briefingRef.id;
  const now = new Date();

  const briefing: Briefing = {
    id: briefingId,
    userId: user.id,
    topic: request.topic,
    description: request.description,
    schedule: 'weekly',
    sources: [],
    categories: [],
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  await briefingRef.set({
    title: briefing.topic,
    archived: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  logger.info('Briefing created', { briefingId, userId: user.id });

  return briefing;
}

export async function getBriefings(
  user: User,
  limit: number = 10,
  offset: number = 0
): Promise<Briefing[]> {
  logger.debug('Fetching briefings', { userId: user.id, limit, offset });

  const briefingsRef = userBriefings(user.id);

  // Fetch all briefings (including archived), sorted client-side
  const snapshot = await briefingsRef
    .limit(limit)
    .get();

  const briefings: Briefing[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: user.id,
      topic: data.title || data.topic || '(untitled)',
      description: data.description,
      schedule: data.settings?.schedule?.frequency || data.schedule || 'unknown',
      sources: data.sources || [],
      categories: data.categories || [],
      active: !data.archived,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
      // Extra fields from real schema
      title: data.title,
      imageUrl: data.imageUrl,
      issueCount: data.issueCount || 0,
      lastIssueNumber: data.lastIssueNumber || 0,
    } as Briefing;
  });

  logger.debug('Fetched briefings', { count: briefings.length });

  return briefings;
}

export async function getBriefingConfig(
  user: User,
  briefingId: string
): Promise<BriefingConfig> {
  logger.debug('Fetching briefing config', { briefingId, userId: user.id });

  const doc = await userBriefings(user.id).doc(briefingId).get();

  if (!doc.exists) {
    throw new NotFoundError('Briefing');
  }

  const data = doc.data()!;

  const config: BriefingConfig = {
    briefingId: doc.id,
    topic: data.title || data.topic || '(untitled)',
    description: data.description,
    schedule: data.settings?.schedule?.frequency || data.schedule || 'unknown',
    sources: data.sources || [],
    categories: data.categories || [],
    active: !data.archived,
    stats: {
      totalEditions: data.issueCount || data.lastIssueNumber || 0,
      lastEditionDate: data.lastRun?.toDate ? data.lastRun.toDate() : undefined,
      totalSummaries: 0,
    },
  };

  return config;
}

export async function updateBriefing(
  user: User,
  briefingId: string,
  updates: UpdateBriefingRequest
): Promise<void> {
  logger.info('Updating briefing', { briefingId, userId: user.id, updates });

  const briefingRef = userBriefings(user.id).doc(briefingId);
  const doc = await briefingRef.get();

  if (!doc.exists) {
    throw new NotFoundError('Briefing');
  }

  // Check tier limits for daily schedule
  if (updates.schedule === 'daily' && user.tier === 'free') {
    const limits = FREE_TIER_LIMITS;
    if (!limits.dailySchedule) {
      throw new TierLimitError(
        'Daily briefings require Protime Pro. Upgrade to access daily schedules.'
      );
    }
  }

  // Build update object
  const updateData: any = {
    updatedAt: new Date().toISOString(),
  };

  if (updates.schedule) updateData['settings.schedule.frequency'] = updates.schedule;
  if (updates.categories) updateData.categories = updates.categories;
  if (updates.active !== undefined) updateData.archived = !updates.active;

  if (updates.sources) {
    updateData.sources = updates.sources.map((url) => ({
      id: userBriefings(user.id).doc().id,
      type: url.includes('/feed') || url.includes('/rss') ? 'rss' : 'newsletter',
      url,
      name: extractNameFromUrl(url),
      active: true,
    }));
  }

  await briefingRef.update(updateData);

  logger.info('Briefing updated', { briefingId });
}

export async function deleteBriefing(
  user: User,
  briefingId: string
): Promise<void> {
  logger.info('Deleting briefing', { briefingId, userId: user.id });

  const briefingRef = userBriefings(user.id).doc(briefingId);
  const doc = await briefingRef.get();

  if (!doc.exists) {
    throw new NotFoundError('Briefing');
  }

  // Soft delete: mark as archived
  await briefingRef.update({
    archived: true,
    updatedAt: new Date().toISOString(),
  });

  logger.info('Briefing archived', { briefingId });
}

// Helper functions

function extractNameFromUrl(url: string): string {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return domain
      .split('.')[0]
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  } catch {
    return 'Unknown Source';
  }
}
