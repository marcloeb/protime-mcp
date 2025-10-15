// Firebase Admin SDK Setup

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import logger from '../utils/logger.js';

// Initialize Firebase Admin
let app: admin.app.App;

try {
  if (!admin.apps.length) {
    // Check if service account key path is provided
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;

    if (serviceAccountPath) {
      // Local development with service account file
      const serviceAccount = await import(serviceAccountPath, {
        assert: { type: 'json' },
      });

      app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount.default),
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

// Firestore collection references
export const collections = {
  users: firestore.collection('users'),
  briefings: firestore.collection('briefings'),
  editions: firestore.collection('editions'),
  sources: firestore.collection('sources'),
  sessions: firestore.collection('sessions'),
};

export default app;
