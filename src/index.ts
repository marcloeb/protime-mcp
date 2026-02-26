// Main Server Entry Point
// Dual transport: --stdio for Claude Desktop, HTTP for remote clients (ChatGPT, web)

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { randomUUID, createHash } from 'crypto';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  StreamableHTTPServerTransport,
} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';
import logger from './utils/logger.js';
import { AppError, AuthenticationError } from './utils/errors.js';
import tools from './tools/index.js';
import { handleToolCall } from './handlers/toolRouter.js';
import { requireAuth, createJWT } from './middleware/auth.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { User } from './types/user.js';
import jwt from 'jsonwebtoken';
import { auth, collections, firestore } from './api/firebase.js';

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.PORT || '8080', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

// ---------------------------------------------------------------------------
// Shared auth helper: extract and verify a Bearer token, return a User
// ---------------------------------------------------------------------------
async function authenticateToken(token: string): Promise<User> {
  // Try JWT first (for ChatGPT OAuth tokens)
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    const userDoc = await collections.users.doc(decoded.userId).get();

    if (!userDoc.exists) {
      throw new AuthenticationError('User not found');
    }

    const userData = userDoc.data()!;
    return {
      id: userDoc.id,
      email: userData.email,
      displayName: userData.displayName,
      photoURL: userData.photoURL,
      tier: userData.tier || 'free',
      createdAt: new Date(userData.createdAt),
      updatedAt: new Date(userData.updatedAt),
    };
  } catch (jwtError) {
    // JWT failed, fall through to Firebase Auth token
  }

  // Try Firebase Auth token
  try {
    const decodedToken = await auth.verifyIdToken(token);
    const userDoc = await collections.users.doc(decodedToken.uid).get();

    if (!userDoc.exists) {
      const newUser: Partial<User> = {
        email: decodedToken.email!,
        displayName: decodedToken.name,
        photoURL: decodedToken.picture,
        tier: 'free',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await collections.users.doc(decodedToken.uid).set(newUser);

      return {
        id: decodedToken.uid,
        ...newUser,
      } as User;
    }

    const userData = userDoc.data()!;
    return {
      id: userDoc.id,
      email: userData.email,
      displayName: userData.displayName,
      photoURL: userData.photoURL,
      tier: userData.tier || 'free',
      createdAt: new Date(userData.createdAt),
      updatedAt: new Date(userData.updatedAt),
    };
  } catch (firebaseError) {
    throw new AuthenticationError('Invalid authentication token');
  }
}

// ---------------------------------------------------------------------------
// STDIO Mode  (--stdio flag)
// ---------------------------------------------------------------------------
async function runStdioMode(): Promise<void> {
  logger.info('Starting Protime MCP Server in stdio mode');

  // In stdio mode there is no HTTP auth. Build a default user from env or
  // return a local-only placeholder so tools still work.
  const localUser: User = {
    id: process.env.STDIO_USER_ID || 'local-user',
    email: process.env.STDIO_USER_EMAIL || 'local@protime.ai',
    displayName: 'Local User',
    tier: (process.env.STDIO_USER_TIER as User['tier']) || 'pro',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const server = createMcpServer(() => localUser);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  logger.info('Protime MCP Server running on stdio');
}

// ---------------------------------------------------------------------------
// HTTP Mode  (default, no flag)
// ---------------------------------------------------------------------------
async function runHttpMode(): Promise<void> {
  const app = express();

  // --- Security middleware ---------------------------------------------------
  app.use(helmet());
  app.use(cors({
    origin: NODE_ENV === 'production'
      ? [
          'https://chatgpt.com',
          'https://chat.openai.com',
          'https://claude.ai',
          'https://api.anthropic.com',
        ]
      : '*',
    credentials: true,
  }));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug('Incoming request', {
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip,
    });
    next();
  });

  // --- Health check ----------------------------------------------------------
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: NODE_ENV,
    });
  });

  // --- ChatGPT Manifest -----------------------------------------------------
  app.get('/manifest', (_req: Request, res: Response) => {
    res.json({
      name: 'Protime Briefings',
      description: 'AI-powered topic briefings delivered automatically',
      version: '1.0.0',
      author: {
        name: 'Protime',
        email: 'marc@protime.ai',
        url: 'https://protime.ai',
      },
      capabilities: {
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      },
      oauth: {
        authorization_url: `${process.env.OAUTH_CALLBACK_URL?.replace('/auth/callback', '')}/auth/login`,
        token_url: `${process.env.OAUTH_CALLBACK_URL?.replace('/auth/callback', '')}/auth/token`,
        scopes: ['briefings:read', 'briefings:write'],
      },
    });
  });

  // --- OAuth Discovery Metadata (ChatGPT) ------------------------------------
  app.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
    const baseUrl = process.env.OAUTH_CALLBACK_URL?.replace('/auth/callback', '') ||
                    `https://${req.get('host')}`;

    res.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/auth/login`,
      token_endpoint: `${baseUrl}/auth/token`,
      scopes_supported: ['briefings:read', 'briefings:write'],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'], // PKCE
      token_endpoint_auth_methods_supported: ['none'], // Public client
    });
  });

  // --- OAuth routes ----------------------------------------------------------

  // Firestore collections for OAuth state
  const oauthCodes = firestore.collection('oauthCodes');
  const oauthRefreshTokens = firestore.collection('oauthRefreshTokens');

  // In-memory store for pending PKCE challenges keyed by state param.
  // In a multi-instance deployment this should move to Firestore, but for a
  // single-process MCP server this is sufficient and avoids an extra round-trip.
  const pendingAuthRequests = new Map<string, {
    codeChallenge: string;
    codeChallengeMethod: string;
    redirectUri: string;
    scope: string;
    clientId: string;
    createdAt: number;
  }>();

  // Cleanup stale pending requests every 15 minutes
  setInterval(() => {
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
    for (const [key, value] of pendingAuthRequests) {
      if (value.createdAt < fifteenMinutesAgo) {
        pendingAuthRequests.delete(key);
      }
    }
  }, 15 * 60 * 1000);

  // GET /auth/login — Redirect user to Protime's authentication page
  app.get('/auth/login', (req: Request, res: Response) => {
    const {
      redirect_uri,
      state,
      code_challenge,
      code_challenge_method,
      client_id,
      scope,
    } = req.query as Record<string, string>;

    if (!redirect_uri || !state || !code_challenge) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameters: redirect_uri, state, code_challenge',
      });
      return;
    }

    // Store the PKCE challenge and request metadata for later validation
    pendingAuthRequests.set(state, {
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method || 'S256',
      redirectUri: redirect_uri,
      scope: scope || 'briefings:read briefings:write',
      clientId: client_id || '',
      createdAt: Date.now(),
    });

    // Build the callback URL that Protime's auth page will redirect back to
    const callbackUrl = process.env.OAUTH_CALLBACK_URL ||
      `${req.protocol}://${req.get('host')}/auth/callback`;

    // Redirect to Protime web app authentication, forwarding state so it
    // round-trips back to us in the callback
    const protimeAuthUrl = new URL('https://protime.ai/auth/connect');
    protimeAuthUrl.searchParams.set('callback', callbackUrl);
    protimeAuthUrl.searchParams.set('state', state);
    if (scope) protimeAuthUrl.searchParams.set('scope', scope);

    logger.info('OAuth login redirect', {
      state,
      redirectUri: redirect_uri,
      codeChallengeMethod: code_challenge_method || 'S256',
    });

    res.redirect(protimeAuthUrl.toString());
  });

  // GET /auth/callback — Protime redirects here after user authenticates
  app.get('/auth/callback', async (req: Request, res: Response, next: NextFunction) => {
    const { code, state } = req.query as Record<string, string>;

    if (!code || !state) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameters: code, state',
      });
      return;
    }

    try {
      // Look up the pending auth request using the state param
      const pending = pendingAuthRequests.get(state);
      if (!pending) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'Unknown or expired state parameter',
        });
        return;
      }

      // The `code` from Protime is a Firebase custom token or a userId.
      // Try to verify it as a Firebase custom token first, fall back to
      // treating it as a direct userId.
      let userId: string;

      try {
        // Attempt to verify as Firebase ID token / custom token
        const decodedToken = await auth.verifyIdToken(code);
        userId = decodedToken.uid;
      } catch {
        // If verification fails, treat `code` as a direct userId and
        // confirm the user exists in Firestore
        const userDoc = await collections.users.doc(code).get();
        if (!userDoc.exists) {
          res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Invalid authorization code',
          });
          return;
        }
        userId = code;
      }

      // Generate a short-lived authorization code
      const authorizationCode = randomUUID();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await oauthCodes.doc(authorizationCode).set({
        userId,
        codeChallenge: pending.codeChallenge,
        codeChallengeMethod: pending.codeChallengeMethod,
        redirectUri: pending.redirectUri,
        scope: pending.scope,
        clientId: pending.clientId,
        expiresAt,
        used: false,
        createdAt: new Date(),
      });

      // Clean up the pending request
      pendingAuthRequests.delete(state);

      logger.info('OAuth authorization code issued', {
        userId,
        authorizationCode: authorizationCode.substring(0, 8) + '...',
      });

      // Redirect back to the client with the authorization code
      const redirectUrl = new URL(pending.redirectUri);
      redirectUrl.searchParams.set('code', authorizationCode);
      redirectUrl.searchParams.set('state', state);

      res.redirect(redirectUrl.toString());
    } catch (error) {
      next(error);
    }
  });

  // POST /auth/token — Exchange authorization code or refresh token for tokens
  app.post('/auth/token', async (req: Request, res: Response, next: NextFunction) => {
    const { grant_type, code, code_verifier, redirect_uri, refresh_token } = req.body;

    try {
      // ---- authorization_code grant ----
      if (grant_type === 'authorization_code') {
        if (!code || !code_verifier) {
          res.status(400).json({
            error: 'invalid_request',
            error_description: 'Missing required parameters: code, code_verifier',
          });
          return;
        }

        // Look up the authorization code in Firestore
        const codeDoc = await oauthCodes.doc(code).get();
        if (!codeDoc.exists) {
          res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Invalid authorization code',
          });
          return;
        }

        const codeData = codeDoc.data()!;

        // Check if the code has already been used
        if (codeData.used) {
          logger.warn('Attempted reuse of authorization code', {
            code: code.substring(0, 8) + '...',
            userId: codeData.userId,
          });
          res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Authorization code has already been used',
          });
          return;
        }

        // Check expiration
        const expiresAt = codeData.expiresAt.toDate ? codeData.expiresAt.toDate() : new Date(codeData.expiresAt);
        if (expiresAt < new Date()) {
          res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Authorization code has expired',
          });
          return;
        }

        // Validate redirect_uri matches if provided
        if (redirect_uri && redirect_uri !== codeData.redirectUri) {
          res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Redirect URI mismatch',
          });
          return;
        }

        // PKCE validation: SHA256(code_verifier) must equal stored code_challenge
        const computedChallenge = createHash('sha256')
          .update(code_verifier)
          .digest('base64url');

        if (computedChallenge !== codeData.codeChallenge) {
          logger.warn('PKCE code_verifier validation failed', {
            userId: codeData.userId,
          });
          res.status(400).json({
            error: 'invalid_grant',
            error_description: 'PKCE code_verifier validation failed',
          });
          return;
        }

        // Mark code as used (atomically)
        await oauthCodes.doc(code).update({ used: true, usedAt: new Date() });

        // Generate tokens
        const accessToken = createJWT(codeData.userId);
        const newRefreshToken = randomUUID();
        const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

        await oauthRefreshTokens.doc(newRefreshToken).set({
          userId: codeData.userId,
          scope: codeData.scope,
          clientId: codeData.clientId,
          expiresAt: refreshExpiresAt,
          revoked: false,
          createdAt: new Date(),
        });

        logger.info('OAuth tokens issued via authorization_code', {
          userId: codeData.userId,
        });

        res.json({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 604800, // 7 days in seconds
          refresh_token: newRefreshToken,
          scope: codeData.scope,
        });
        return;
      }

      // ---- refresh_token grant ----
      if (grant_type === 'refresh_token') {
        if (!refresh_token) {
          res.status(400).json({
            error: 'invalid_request',
            error_description: 'Missing required parameter: refresh_token',
          });
          return;
        }

        const tokenDoc = await oauthRefreshTokens.doc(refresh_token).get();
        if (!tokenDoc.exists) {
          res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Invalid refresh token',
          });
          return;
        }

        const tokenData = tokenDoc.data()!;

        // Check if revoked
        if (tokenData.revoked) {
          logger.warn('Attempted use of revoked refresh token', {
            userId: tokenData.userId,
          });
          res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Refresh token has been revoked',
          });
          return;
        }

        // Check expiration
        const tokenExpiresAt = tokenData.expiresAt.toDate
          ? tokenData.expiresAt.toDate()
          : new Date(tokenData.expiresAt);
        if (tokenExpiresAt < new Date()) {
          res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Refresh token has expired',
          });
          return;
        }

        // Revoke the old refresh token (rotation)
        await oauthRefreshTokens.doc(refresh_token).update({
          revoked: true,
          revokedAt: new Date(),
        });

        // Issue new tokens
        const accessToken = createJWT(tokenData.userId);
        const rotatedRefreshToken = randomUUID();
        const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

        await oauthRefreshTokens.doc(rotatedRefreshToken).set({
          userId: tokenData.userId,
          scope: tokenData.scope,
          clientId: tokenData.clientId,
          expiresAt: refreshExpiresAt,
          revoked: false,
          createdAt: new Date(),
          previousToken: refresh_token,
        });

        logger.info('OAuth tokens issued via refresh_token', {
          userId: tokenData.userId,
        });

        res.json({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 604800, // 7 days
          refresh_token: rotatedRefreshToken,
          scope: tokenData.scope,
        });
        return;
      }

      // Unsupported grant type
      res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: `Grant type '${grant_type}' is not supported. Use 'authorization_code' or 'refresh_token'.`,
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /auth/status — Check authentication status (unchanged)
  app.get('/auth/status', requireAuth, (req: Request, res: Response) => {
    res.json({
      authenticated: true,
      user: {
        id: req.user!.id,
        email: req.user!.email,
        tier: req.user!.tier,
      },
    });
  });

  // POST /auth/logout — Revoke all refresh tokens for the authenticated user
  app.post('/auth/logout', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      // Revoke all active refresh tokens for this user
      const activeTokens = await oauthRefreshTokens
        .where('userId', '==', userId)
        .where('revoked', '==', false)
        .get();

      const batch = firestore.batch();
      activeTokens.docs.forEach((doc) => {
        batch.update(doc.ref, { revoked: true, revokedAt: new Date() });
      });
      await batch.commit();

      logger.info('OAuth logout: refresh tokens revoked', {
        userId,
        revokedCount: activeTokens.size,
      });

      res.json({
        success: true,
        revoked_tokens: activeTokens.size,
      });
    } catch (error) {
      next(error);
    }
  });

  // --- Express tool endpoint (ChatGPT backwards compat) ----------------------
  app.post('/tools/:toolName', apiLimiter, requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    const { toolName } = req.params;
    const input = req.body;
    const user = req.user!;

    logger.info('Tool call received', {
      toolName,
      userId: user.id,
      input: JSON.stringify(input),
    });

    try {
      const result = await handleToolCall(toolName, input, user);

      logger.info('Tool call successful', {
        toolName,
        userId: user.id,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  });

  // --- Streamable HTTP MCP transport -----------------------------------------
  // Each authenticated session gets its own transport + McpServer instance.

  const sessions = new Map<string, {
    transport: StreamableHTTPServerTransport;
    user: User;
  }>();

  // POST /mcp  — main MCP message endpoint
  app.post('/mcp', async (req: Request, res: Response) => {
    const existingSessionId = req.headers['mcp-session-id'] as string | undefined;

    // --- Resume existing session ---
    if (existingSessionId && sessions.has(existingSessionId)) {
      const session = sessions.get(existingSessionId)!;

      logger.debug('Resuming MCP session', {
        sessionId: existingSessionId,
        userId: session.user.id,
      });

      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    // --- New session: authenticate first ---
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Authentication required' },
        id: null,
      });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    let user: User;

    try {
      user = await authenticateToken(token);
    } catch (error) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Invalid authentication token' },
        id: null,
      });
      return;
    }

    // Create a new session
    const sessionId = randomUUID();

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
      onsessioninitialized: () => {
        logger.info('MCP session initialized', {
          sessionId,
          userId: user.id,
        });
      },
    });

    // Clean up on close
    transport.onclose = () => {
      logger.info('MCP session closed', { sessionId, userId: user.id });
      sessions.delete(sessionId);
    };

    sessions.set(sessionId, { transport, user });

    // Create a new McpServer bound to this user
    const server = createMcpServer(() => user);
    await server.connect(transport);

    // Handle the initial request
    await transport.handleRequest(req, res, req.body);
  });

  // GET /mcp  — SSE stream for server-to-client notifications
  app.get('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Invalid or missing session ID' },
        id: null,
      });
      return;
    }

    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);
  });

  // DELETE /mcp  — terminate session
  app.delete('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Invalid or missing session ID' },
        id: null,
      });
      return;
    }

    const session = sessions.get(sessionId)!;

    logger.info('MCP session delete requested', {
      sessionId,
      userId: session.user.id,
    });

    await session.transport.handleRequest(req, res);
    sessions.delete(sessionId);
  });

  // --- Error handling middleware ----------------------------------------------
  app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof AppError) {
      logger.warn('Application error', {
        statusCode: error.statusCode,
        message: error.message,
        code: error.code,
        path: req.path,
      });

      return res.status(error.statusCode).json({
        success: false,
        error: {
          message: error.message,
          code: error.code,
        },
      });
    }

    // Unhandled error
    logger.error('Unhandled error', {
      error: error.message,
      stack: error.stack,
      path: req.path,
    });

    res.status(500).json({
      success: false,
      error: {
        message: NODE_ENV === 'production'
          ? 'Internal server error'
          : error.message,
        code: 'INTERNAL_ERROR',
      },
    });
  });

  // --- 404 handler -----------------------------------------------------------
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        message: 'Endpoint not found',
        code: 'NOT_FOUND',
      },
    });
  });

  // --- Start server ----------------------------------------------------------
  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info('Protime MCP Server started (HTTP mode)', {
      port: PORT,
      environment: NODE_ENV,
      nodeVersion: process.version,
    });
  });

  // --- Graceful shutdown -----------------------------------------------------
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);

    // Close all active MCP sessions
    for (const [sessionId, session] of sessions) {
      logger.debug('Closing MCP session on shutdown', { sessionId });
      session.transport.close();
    }
    sessions.clear();

    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// ---------------------------------------------------------------------------
// Entry point: decide transport based on CLI args
// ---------------------------------------------------------------------------
const isStdio = process.argv.includes('--stdio');

if (isStdio) {
  runStdioMode().catch((error) => {
    logger.error('Fatal error in stdio mode', { error: error.message, stack: error.stack });
    process.exit(1);
  });
} else {
  runHttpMode().catch((error) => {
    logger.error('Fatal error in HTTP mode', { error: error.message, stack: error.stack });
    process.exit(1);
  });
}
