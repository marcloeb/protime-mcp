// Discovery Handlers - Business logic for ChatGPT onboarding flow

import { collections, adminAuth } from '../api/firebase.js';
import { User } from '../types/user.js';
import { NotFoundError, AuthorizationError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import axios from 'axios';

// Types matching Cloud Functions
interface SubTopic {
  id: string;
  label: string;
  relevance: number;
}

interface DiscoverySession {
  userId: string;
  sessionId: string;
  status: 'topics_discovered' | 'sources_ready' | 'completed' | 'expired';
  createdAt: Date;
  expiresAt: Date;
  topics: string[];
  subTopics: SubTopic[];
  regions: string[];
  customKeywords: string[];
  refinementLevel: number;
  discoveryPrompt: string;
  discoveredSources?: {
    totalSources: number;
    breakdown: {
      newsletters: number;
      rss: number;
      youtube: number;
      googleSearch: number;
    };
    details: {
      newsletters: any[];
      rss: any[];
      youtube: any[];
      googleSearch: any[];
    };
    suggestedForLater: number;
  };
}

interface DiscoveredSource {
  name: string;
  url: string;
  type: 'newsletter' | 'rss' | 'youtube' | 'googleSearch';
  category: string;
  relevance: number;
}

/**
 * Call discoverTopics Cloud Function
 */
export async function discoverTopics(
  user: User,
  topics: string[],
  options: {
    regions?: string[];
    refinementLevel?: number;
    customKeywords?: string[];
    sessionId?: string;
  } = {}
): Promise<{
  success: boolean;
  sessionId: string;
  subTopics: SubTopic[];
  topics: string[];
  regions: string[];
  customKeywords: string[];
  refinementLevel: number;
  message: string;
}> {
  logger.info('Discovering topics', { userId: user.id, topics, options });

  // Get user's Firebase ID token
  const idToken = await getUserIdToken(user.firebaseUid || user.id);

  // Call discoverTopics Cloud Function
  const response = await axios.post(
    `${process.env.FIREBASE_FUNCTIONS_URL}/discoverTopics`,
    {
      data: {
        topics,
        regions: options.regions || [],
        refinementLevel: options.refinementLevel || 0,
        customKeywords: options.customKeywords || [],
        sessionId: options.sessionId,
      },
    },
    {
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const result = response.data.result;
  logger.info('Topics discovered', { sessionId: result.sessionId, subTopicsCount: result.subTopics.length });

  return result;
}

/**
 * Call discoverSources Cloud Function
 */
export async function discoverSources(
  user: User,
  sessionId: string
): Promise<{
  success: boolean;
  sessionId: string;
  totalSources: number;
  breakdown: {
    newsletters: number;
    rss: number;
    youtube: number;
    googleSearch: number;
  };
  topSources: DiscoveredSource[];
  message: string;
}> {
  logger.info('Discovering sources', { userId: user.id, sessionId });

  // Get user's Firebase ID token
  const idToken = await getUserIdToken(user.firebaseUid || user.id);

  // Call discoverSources Cloud Function
  const response = await axios.post(
    `${process.env.FIREBASE_FUNCTIONS_URL}/discoverSources`,
    {
      data: {
        sessionId,
      },
    },
    {
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const result = response.data.result;
  logger.info('Sources discovered', {
    sessionId: result.sessionId,
    totalSources: result.totalSources,
    breakdown: result.breakdown,
  });

  return result;
}

/**
 * Call createBriefingFromDiscovery Cloud Function
 */
export async function createBriefingFromDiscovery(
  user: User,
  sessionId: string,
  options: {
    title?: string;
    schedule?: {
      frequency?: 'Daily' | 'Weekly' | 'Every 2 Days' | 'Every 3 Days' | 'Every 2 Weeks' | 'Monthly';
      time?: string;
      weekday?: string;
    };
    deliveryEmail?: string;
  } = {}
): Promise<{
  success: boolean;
  briefingId: string;
  briefing: any;
  message: string;
}> {
  logger.info('Creating briefing from discovery', { userId: user.id, sessionId, options });

  // Get user's Firebase ID token
  const idToken = await getUserIdToken(user.firebaseUid || user.id);

  // Call createBriefingFromDiscovery Cloud Function
  const response = await axios.post(
    `${process.env.FIREBASE_FUNCTIONS_URL}/createBriefingFromDiscovery`,
    {
      data: {
        sessionId,
        title: options.title,
        schedule: options.schedule,
        deliveryEmail: options.deliveryEmail,
      },
    },
    {
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const result = response.data.result;
  logger.info('Briefing created from discovery', {
    briefingId: result.briefingId,
    sessionId,
  });

  return result;
}

/**
 * Get discovery session (for debugging/status checks)
 */
export async function getDiscoverySession(
  user: User,
  sessionId: string
): Promise<DiscoverySession> {
  logger.debug('Fetching discovery session', { sessionId, userId: user.id });

  const doc = await collections.users
    .doc(user.firebaseUid || user.id)
    .collection('discoverySessions')
    .doc(sessionId)
    .get();

  if (!doc.exists) {
    throw new NotFoundError('Discovery session');
  }

  const data = doc.data();

  // Verify ownership (should match from path, but double-check)
  if (data!.userId !== (user.firebaseUid || user.id)) {
    throw new AuthorizationError('You do not have access to this discovery session');
  }

  return {
    ...data,
    createdAt: data!.createdAt.toDate(),
    expiresAt: data!.expiresAt.toDate(),
  } as DiscoverySession;
}

/**
 * Helper: Get Firebase ID token for authenticated calls to Cloud Functions
 */
async function getUserIdToken(firebaseUid: string): Promise<string> {
  try {
    // Create a custom token for the user
    const customToken = await adminAuth.createCustomToken(firebaseUid);

    // Exchange custom token for ID token
    // In production, this would typically be handled by the frontend
    // For MCP server, we use the custom token directly with Cloud Functions
    // that accept both ID tokens and custom tokens

    // For now, return the custom token (Cloud Functions can verify it)
    // In a full implementation, you'd exchange this for an ID token via Firebase Auth REST API
    return customToken;
  } catch (error: any) {
    logger.error('Failed to get user ID token', { firebaseUid, error: error.message });
    throw new Error('Authentication failed');
  }
}
