/**
 * Shared MCP transport selection + remote auth for DCYFR FastMCP servers.
 *
 * The default transport is **stdio** (unchanged, fully backward-compatible).
 * Setting `MCP_TRANSPORT=httpStream` switches a server to FastMCP's Streamable
 * HTTP transport so it can be reached as a *remote* MCP server — usable today
 * as a Claude Desktop / Anthropic API custom connector (with an
 * `Authorization: Bearer` header), and the foundation for a claude.ai Custom
 * Connector (which additionally needs public HTTPS + OAuth — see REMOTE.md).
 *
 * Remote mode is **fail-closed**: a server that exposes any write / open-world
 * tool (e.g. `promptintel:submitReport`) MUST NOT bind an HTTP port without at
 * least one bearer token configured. `assertRemoteAuthConfigured` enforces this
 * at startup; `buildBearerAuthenticator` enforces it per request in constant
 * time.
 *
 * Env:
 *   MCP_TRANSPORT      "stdio" | "httpStream"                  (default "stdio")
 *   MCP_HTTP_PORT      port for httpStream                     (default 8080)
 *   MCP_HTTP_ENDPOINT  endpoint path                           (default "/mcp")
 *   MCP_HTTP_STATELESS "true" to run stateless                 (default false)
 *   MCP_BEARER_TOKEN   comma-separated allowed bearer tokens   (REQUIRED for httpStream)
 */

import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export type McpTransportType = 'stdio' | 'httpStream';

export type ResolvedTransportConfig =
  | { transportType: 'stdio' }
  | {
      transportType: 'httpStream';
      httpStream: { port: number; endpoint: `/${string}`; stateless: boolean };
    };

export interface BearerSession extends Record<string, unknown> {
  authenticated: true;
}

/** Parse the comma-separated allow-list of bearer tokens from the environment. */
export function allowedBearerTokens(): string[] {
  return (process.env.MCP_BEARER_TOKEN ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/** Constant-time string comparison (length-guarded) to avoid token timing leaks. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Build a FastMCP `authenticate` hook enforcing `Authorization: Bearer <token>`
 * against `MCP_BEARER_TOKEN`. Returns a minimal session on success; throws a
 * 401 `Response` on failure. Under stdio this is never invoked (no HTTP
 * request), so it is safe to pass unconditionally.
 */
export function buildBearerAuthenticator(): (request: IncomingMessage) => Promise<BearerSession> {
  return async (request: IncomingMessage): Promise<BearerSession> => {
    const tokens = allowedBearerTokens();
    const header = request.headers['authorization'];
    const raw = Array.isArray(header) ? header[0] : header;
    const provided = raw && raw.startsWith('Bearer ') ? raw.slice('Bearer '.length).trim() : '';

    const authorized = provided.length > 0 && tokens.some((token) => safeEqual(provided, token));
    if (!authorized) {
      throw new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'content-type': 'application/json' },
      });
    }
    return { authenticated: true };
  };
}

/** Resolve the transport configuration from the environment. */
export function resolveTransportConfig(): ResolvedTransportConfig {
  const transport = (process.env.MCP_TRANSPORT ?? 'stdio').trim() as McpTransportType;
  if (transport === 'httpStream') {
    const port = Number.parseInt(process.env.MCP_HTTP_PORT ?? '8080', 10);
    const endpointRaw = (process.env.MCP_HTTP_ENDPOINT ?? '/mcp').trim();
    const endpoint = (endpointRaw.startsWith('/') ? endpointRaw : `/${endpointRaw}`) as `/${string}`;
    const stateless = /^(1|true|yes)$/i.test(process.env.MCP_HTTP_STATELESS ?? '');
    return { transportType: 'httpStream', httpStream: { port, endpoint, stateless } };
  }
  return { transportType: 'stdio' };
}

/**
 * Fail-closed guard: refuse to start an HTTP-exposed server without a bearer
 * token. Call BEFORE `server.start()`.
 */
export function assertRemoteAuthConfigured(serverName: string, config: ResolvedTransportConfig): void {
  if (config.transportType === 'httpStream' && allowedBearerTokens().length === 0) {
    throw new Error(
      `Refusing to start ${serverName} over httpStream without MCP_BEARER_TOKEN. ` +
        'Remote MCP exposure requires at least one bearer token (comma-separated allowed). ' +
        'Set MCP_BEARER_TOKEN, or use the default stdio transport for local use.'
    );
  }
}

/** Human-readable one-line startup banner for the resolved transport. */
export function describeTransport(serverName: string, config: ResolvedTransportConfig): string {
  if (config.transportType === 'httpStream') {
    return `✅ ${serverName} started (httpStream) on http://0.0.0.0:${config.httpStream.port}${config.httpStream.endpoint} — bearer auth enforced`;
  }
  return `✅ ${serverName} started (stdio mode)`;
}
