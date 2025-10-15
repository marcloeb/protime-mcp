// Briefing Handlers - Business logic for briefing operations

import { collections } from '../api/firebase.js';
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

  // Check tier limits
  const existingBriefings = await collections.briefings
    .where('userId', '==', user.id)
    .where('active', '==', true)
    .get();

  const limits = user.tier === 'free' ? FREE_TIER_LIMITS : PRO_TIER_LIMITS;

  if (existingBriefings.size >= limits.maxBriefings) {
    throw new TierLimitError(
      `Free tier allows only ${limits.maxBriefings} briefing. Upgrade to Pro for unlimited briefings.`
    );
  }

  // Create briefing - generate ID using Firestore
  const briefingRef = collections.briefings.doc();
  const briefingId = briefingRef.id;
  const now = new Date();

  const briefing: Briefing = {
    id: briefingId,
    userId: user.id,
    topic: request.topic,
    description: request.description,
    schedule: 'weekly', // Default to weekly for free tier
    sources: [],
    categories: [],
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  await briefingRef.set({
    userId: briefing.userId,
    topic: briefing.topic,
    description: briefing.description,
    schedule: briefing.schedule,
    sources: briefing.sources,
    categories: briefing.categories,
    active: briefing.active,
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

  const snapshot = await collections.briefings
    .where('userId', '==', user.id)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .offset(offset)
    .get();

  const briefings: Briefing[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      lastRunAt: data.lastRunAt ? new Date(data.lastRunAt) : undefined,
      nextRunAt: data.nextRunAt ? new Date(data.nextRunAt) : undefined,
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

  const doc = await collections.briefings.doc(briefingId).get();

  if (!doc.exists) {
    throw new NotFoundError('Briefing');
  }

  const briefing = doc.data() as Briefing;

  // Verify ownership
  if (briefing.userId !== user.id) {
    throw new AuthorizationError('You do not have access to this briefing');
  }

  // Get edition stats
  const editionsSnapshot = await collections.editions
    .where('briefingId', '==', briefingId)
    .orderBy('generatedAt', 'desc')
    .limit(1)
    .get();

  const totalEditionsSnapshot = await collections.editions
    .where('briefingId', '==', briefingId)
    .count()
    .get();

  const lastEdition = editionsSnapshot.empty
    ? undefined
    : editionsSnapshot.docs[0].data();

  const config: BriefingConfig = {
    briefingId: briefing.id,
    topic: briefing.topic,
    description: briefing.description,
    schedule: briefing.schedule,
    sources: briefing.sources,
    categories: briefing.categories,
    active: briefing.active,
    stats: {
      totalEditions: totalEditionsSnapshot.data().count,
      lastEditionDate: lastEdition?.generatedAt
        ? new Date(lastEdition.generatedAt)
        : undefined,
      totalSummaries: lastEdition?.summaryCount || 0,
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

  const doc = await collections.briefings.doc(briefingId).get();

  if (!doc.exists) {
    throw new NotFoundError('Briefing');
  }

  const briefing = doc.data() as Briefing;

  // Verify ownership
  if (briefing.userId !== user.id) {
    throw new AuthorizationError('You do not have access to this briefing');
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

  if (updates.schedule) updateData.schedule = updates.schedule;
  if (updates.categories) updateData.categories = updates.categories;
  if (updates.active !== undefined) updateData.active = updates.active;

  // Handle sources update (convert URLs to Source objects)
  if (updates.sources) {
    updateData.sources = updates.sources.map((url) => ({
      id: collections.briefings.doc().id,
      type: url.includes('/feed') || url.includes('/rss') ? 'rss' : 'newsletter',
      url,
      name: extractNameFromUrl(url),
      active: true,
    }));
  }

  await collections.briefings.doc(briefingId).update(updateData);

  logger.info('Briefing updated', { briefingId });
}

export async function deleteBriefing(
  user: User,
  briefingId: string
): Promise<void> {
  logger.info('Deleting briefing', { briefingId, userId: user.id });

  const doc = await collections.briefings.doc(briefingId).get();

  if (!doc.exists) {
    throw new NotFoundError('Briefing');
  }

  const briefing = doc.data();

  // Verify ownership
  if (briefing!.userId !== user.id) {
    throw new AuthorizationError('You do not have access to this briefing');
  }

  // Delete briefing
  await collections.briefings.doc(briefingId).delete();

  // Delete all editions (async, don't wait)
  collections.editions
    .where('briefingId', '==', briefingId)
    .get()
    .then((snapshot) => {
      const batch = collections.editions.firestore.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      return batch.commit();
    })
    .catch((error) => {
      logger.error('Failed to delete editions', { briefingId, error });
    });

  logger.info('Briefing deleted', { briefingId });
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
