// Firebase Admin SDK Setup

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import logger from '../utils/logger.js';

// Initialize Firebase Admin
let app: admin.app.App;

try {
  if (!admin.apps.length) {
    // Check if service account key path is provided
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;

    if (serviceAccountPath) {
      // Local development with service account file
      const absolutePath = resolve(serviceAccountPath);
      const serviceAccount = JSON.parse(readFileSync(absolutePath, 'utf-8'));

      app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    } else {
      // Cloud Run - uses Application Default Credentials
      app = admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    }

    logger.info('Firebase Admin initialized successfully');
  } else {
    app = admin.apps[0]!;
  }
} catch (error) {
  logger.error('Failed to initialize Firebase Admin', { error });
  throw error;
}

export const firestore = getFirestore(app);
export const auth = getAuth(app);
export const adminAuth = getAuth(app);

// Firestore collection references
// Note: briefings and editions are SUBCOLLECTIONS under users/{userId}/
// Use userBriefings(userId) and userEditions(userId, briefingId) helpers
export const collections = {
  users: firestore.collection('users'),
  sources: firestore.collection('sources'),
  sessions: firestore.collection('sessions'),
};

/** Get briefings subcollection for a user: users/{userId}/briefings */
export function userBriefings(userId: string) {
  return firestore.collection('users').doc(userId).collection('briefings');
}

/** Get editions subcollection for a briefing: users/{userId}/briefings/{briefingId}/editions */
export function userEditions(userId: string, briefingId: string) {
  return firestore.collection('users').doc(userId).collection('briefings').doc(briefingId).collection('editions');
}

export default app;
