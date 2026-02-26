// Main Server Entry Point
// Dual transport: --stdio for Claude Desktop, HTTP for remote clients (ChatGPT, web)

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  StreamableHTTPServerTransport,
} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';
import logger from './utils/logger.js';
import { AppError, AuthenticationError } from './utils/errors.js';
import tools from './tools/index.js';
import { handleToolCall } from './handlers/toolRouter.js';
import { requireAuth } from './middleware/auth.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { User } from './types/user.js';
import jwt from 'jsonwebtoken';
import { auth, collections } from './api/firebase.js';

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
  app.get('/auth/login', (_req: Request, res: Response) => {
    const redirectUrl = `https://protime.ai/auth/chatgpt?callback=${encodeURIComponent(process.env.OAUTH_CALLBACK_URL!)}`;
    res.redirect(redirectUrl);
  });

  app.get('/auth/callback', async (req: Request, res: Response, next: NextFunction) => {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code missing' });
    }

    try {
      // TODO: Implement token exchange with Protime OAuth
      logger.info('OAuth callback received', { code, state });

      res.json({
        success: true,
        message: 'Authentication successful',
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/auth/token', async (req: Request, res: Response, next: NextFunction) => {
    const { code, grant_type } = req.body;

    if (grant_type !== 'authorization_code') {
      return res.status(400).json({ error: 'Unsupported grant type' });
    }

    try {
      // TODO: Implement actual token exchange
      logger.info('Token exchange requested', { code });

      res.json({
        access_token: 'mock_access_token',
        token_type: 'Bearer',
        expires_in: 604800, // 7 days
        refresh_token: 'mock_refresh_token',
      });
    } catch (error) {
      next(error);
    }
  });

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

  app.post('/auth/logout', (_req: Request, res: Response) => {
    // TODO: Invalidate session/token
    res.json({ success: true });
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
