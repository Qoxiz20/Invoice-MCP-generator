import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { z } from 'zod';

import { sheetsTools } from '../../../src/sheetsTools';
import { mcpDriveTools } from '../../../src/mcpDriveTools';
import { whatsappTools } from '../../../src/whatsappTools';
import { verifyAccessToken } from '../../../lib/jwt';

// All 6 existing tools, business logic completely untouched - only the
// registration call syntax below adapts to mcp-handler v2 / SDK v2's
// server.registerTool() API.
const allTools = [...sheetsTools, ...mcpDriveTools, ...whatsappTools];

const handler = createMcpHandler((server) => {
  for (const tool of allTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        // Old tool definitions store inputSchema as a raw zod shape object
        // (e.g. { spreadsheetId: z.string() }) - SDK v2 wants that wrapped
        // in z.object(). This is the only change needed; tool.handler
        // itself is called exactly as before.
        inputSchema: z.object(tool.inputSchema),
      },
      tool.handler
    );
  }
});

/**
 * Validates the access token WE issued (see lib/jwt.js + app/api/token).
 * This is never a Google token - Google is only used inside /api/authorize
 * to confirm identity, one step removed from here.
 */
async function verifyToken(req, bearerToken) {
  if (!bearerToken) return undefined;

  try {
    const payload = await verifyAccessToken(bearerToken);

    console.log('verifyToken SUCCESS:', {
      sub: payload.sub,
      scope: payload.scope,
      aud: payload.aud,
      iss: payload.iss,
    });

    const scopes = typeof payload.scope === 'string' ? payload.scope.split(' ') : [];

    return {
      token: bearerToken,
      scopes,
      clientId: process.env.MCP_CLIENT_ID,
      extra: { email: payload.sub },
    };
  } catch (err) {
    console.error('verifyToken FAILED:', err?.message || err);
    return undefined;
  }
}

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  requiredScopes: ['mcp:tools'],
  resourceMetadataPath: '/.well-known/oauth-protected-resource',
});

export { authHandler as GET, authHandler as POST };
