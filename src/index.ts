// Main Server Entry Point

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { MCPServer } from './types/mcp.js';
import logger from './utils/logger.js';
import { AppError } from './utils/errors.js';
import tools from './tools/index.js';
import { handleToolCall } from './handlers/toolRouter.js';
import { requireAuth } from './middleware/auth.js';
import { apiLimiter } from './middleware/rateLimit.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

// Security middleware
app.use(helmet());
app.use(cors({
  origin: NODE_ENV === 'production'
    ? ['https://chatgpt.com', 'https://chat.openai.com']
    : '*',
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  logger.debug('Incoming request', {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
  });
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: NODE_ENV,
  });
});

// MCP Server Configuration
const mcpServer = new MCPServer({
  name: 'protime-briefings',
  version: '1.0.0',
  description: 'AI-powered topic briefings for ChatGPT',
  tools,
});

// MCP Tool Execution Endpoint
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

// MCP Manifest Endpoint (for ChatGPT to discover tools)
app.get('/manifest', (req: Request, res: Response) => {
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

// OAuth Discovery Metadata (Required by ChatGPT for OAuth)
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
    token_endpoint_auth_methods_supported: ['none'], // Public client (no client_secret)
  });
});

// OAuth endpoints
app.get('/auth/login', (req: Request, res: Response) => {
  // Redirect to Protime OAuth page
  const redirectUrl = `https://protime.ai/auth/chatgpt?callback=${encodeURIComponent(process.env.OAUTH_CALLBACK_URL!)}`;
  res.redirect(redirectUrl);
});

app.get('/auth/callback', async (req: Request, res: Response, next: NextFunction) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Authorization code missing' });
  }

  try {
    // Exchange code for token
    // TODO: Implement token exchange with Protime OAuth
    logger.info('OAuth callback received', { code, state });

    // For now, return success
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

    // Mock response for now
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

app.post('/auth/logout', (req: Request, res: Response) => {
  // TODO: Invalidate session/token
  res.json({ success: true });
});

// Error handling middleware
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
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

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      message: 'Endpoint not found',
      code: 'NOT_FOUND',
    },
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Protime MCP Server started`, {
    port: PORT,
    environment: NODE_ENV,
    nodeVersion: process.version,
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

export default app;
