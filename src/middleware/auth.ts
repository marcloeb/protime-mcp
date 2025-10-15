// Authentication Middleware

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { auth, collections } from '../api/firebase.js';
import { User } from '../types/user.js';
import { AuthenticationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('No authentication token provided');
    }

    const token = authHeader.split('Bearer ')[1];

    // Try JWT first (for ChatGPT OAuth tokens)
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

      // Fetch user from Firestore
      const userDoc = await collections.users.doc(decoded.userId).get();

      if (!userDoc.exists) {
        throw new AuthenticationError('User not found');
      }

      const userData = userDoc.data()!;
      req.user = {
        id: userDoc.id,
        email: userData.email,
        displayName: userData.displayName,
        photoURL: userData.photoURL,
        tier: userData.tier || 'free',
        createdAt: new Date(userData.createdAt),
        updatedAt: new Date(userData.updatedAt),
      };

      logger.debug('User authenticated via JWT', {
        userId: req.user.id,
        tier: req.user.tier,
      });

      return next();
    } catch (jwtError) {
      // If JWT fails, try Firebase Auth token
      logger.debug('JWT verification failed, trying Firebase token');
    }

    // Try Firebase Auth token
    try {
      const decodedToken = await auth.verifyIdToken(token);

      // Fetch user from Firestore
      const userDoc = await collections.users.doc(decodedToken.uid).get();

      if (!userDoc.exists) {
        // Create user if doesn't exist (first time)
        const newUser: Partial<User> = {
          email: decodedToken.email!,
          displayName: decodedToken.name,
          photoURL: decodedToken.picture,
          tier: 'free',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await collections.users.doc(decodedToken.uid).set(newUser);

        req.user = {
          id: decodedToken.uid,
          ...newUser,
        } as User;

        logger.info('New user created', { userId: decodedToken.uid });
      } else {
        const userData = userDoc.data()!;
        req.user = {
          id: userDoc.id,
          email: userData.email,
          displayName: userData.displayName,
          photoURL: userData.photoURL,
          tier: userData.tier || 'free',
          createdAt: new Date(userData.createdAt),
          updatedAt: new Date(userData.updatedAt),
        };
      }

      logger.debug('User authenticated via Firebase', {
        userId: req.user.id,
        tier: req.user.tier,
      });

      return next();
    } catch (firebaseError) {
      logger.warn('Firebase token verification failed', {
        error: firebaseError instanceof Error ? firebaseError.message : 'Unknown error',
      });
      throw new AuthenticationError('Invalid authentication token');
    }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      res.status(401).json({
        success: false,
        error: {
          message: error.message,
          code: 'AUTH_ERROR',
        },
      });
    } else {
      logger.error('Authentication error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      res.status(500).json({
        success: false,
        error: {
          message: 'Authentication failed',
          code: 'AUTH_ERROR',
        },
      });
    }
  }
}

// Optional: Create JWT token for ChatGPT users
export function createJWT(userId: string, chatgptUserId?: string): string {
  const payload = {
    userId,
    chatgptUserId,
    iat: Math.floor(Date.now() / 1000),
  };

  const options: jwt.SignOptions = {
    expiresIn: (process.env.JWT_EXPIRY as jwt.SignOptions['expiresIn']) || '7d',
  };

  return jwt.sign(payload, process.env.JWT_SECRET!, options);
}
