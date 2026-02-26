// Rate Limiting Middleware

import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';
import type { User } from '../types/user.js';

// Tier-based limits (requests per minute)
const TIER_LIMITS: Record<string, number> = {
  free: 10,
  pro: 60,
  enterprise: 200,
};

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  message: {
    success: false,
    error: {
      message: 'Too many requests, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return process.env.NODE_ENV === 'development';
  },
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userId: (req as any).user?.id,
    });

    res.status(429).json({
      success: false,
      error: {
        message: 'Too many requests, please try again later',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: res.getHeader('Retry-After'),
      },
    });
  },
});

// Stricter limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 attempts per hour
  message: {
    success: false,
    error: {
      message: 'Too many authentication attempts, please try again later',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });

    res.status(429).json({
      success: false,
      error: {
        message: 'Too many authentication attempts, please try again in an hour',
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
      },
    });
  },
});

// Per-user tier-based rate limiter
export const userRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: (req) => {
    const tier = (req as any).user?.tier || 'free';
    return TIER_LIMITS[tier] || TIER_LIMITS.free;
  },
  keyGenerator: (req) => {
    return (req as any).user?.id || req.ip;
  },
  skip: (req) => {
    return process.env.NODE_ENV === 'development';
  },
  handler: (req, res) => {
    const user = (req as any).user as User | undefined;
    const tier = user?.tier || 'free';
    const limit = TIER_LIMITS[tier] || TIER_LIMITS.free;

    logger.warn('User rate limit exceeded', {
      userId: user?.id,
      tier,
      limit,
      path: req.path,
    });

    res.status(429).json({
      success: false,
      error: {
        message: `Rate limit exceeded (${limit} requests/minute for ${tier} tier)`,
        code: 'USER_RATE_LIMIT_EXCEEDED',
      },
    });
  },
});

// Standalone rate check for MCP endpoint (called after inline auth)
const mcpBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkMcpRateLimit(user: User): { allowed: boolean; limit: number; remaining: number } {
  if (process.env.NODE_ENV === 'development') {
    return { allowed: true, limit: 999, remaining: 999 };
  }

  const limit = TIER_LIMITS[user.tier] || TIER_LIMITS.free;
  const now = Date.now();
  const key = user.id;

  let bucket = mcpBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 60_000 };
    mcpBuckets.set(key, bucket);
  }

  bucket.count++;

  if (bucket.count > limit) {
    logger.warn('MCP rate limit exceeded', { userId: user.id, tier: user.tier, limit });
    return { allowed: false, limit, remaining: 0 };
  }

  return { allowed: true, limit, remaining: limit - bucket.count };
}

// Cleanup stale MCP buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of mcpBuckets) {
    if (now >= bucket.resetAt) {
      mcpBuckets.delete(key);
    }
  }
}, 5 * 60 * 1000);
