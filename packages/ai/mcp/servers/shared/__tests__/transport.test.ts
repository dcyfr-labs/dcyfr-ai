/**
 * Shared MCP transport + fail-closed bearer auth tests.
 * TLP:AMBER
 *
 * Covers the four serving guarantees task `dcyfr-mcp-remote-serving` 1.1 asks a
 * factory server to honor once its start script wires these helpers:
 *   - stdio unchanged (default env)               -> resolveTransportConfig()
 *   - httpStream without a bearer -> fail closed  -> assertRemoteAuthConfigured()
 *   - request without a bearer -> 401             -> buildBearerAuthenticator()
 *   - request with a valid bearer -> authorized   -> buildBearerAuthenticator()
 */

import type { IncomingMessage } from 'node:http';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  allowedBearerTokens,
  buildBearerAuthenticator,
  resolveTransportConfig,
  assertRemoteAuthConfigured,
  describeTransport,
} from '../transport.js';

// ---------------------------------------------------------------------------
// Env save/restore — these helpers read process.env at call time.
// ---------------------------------------------------------------------------

const ENV_KEYS = [
  'MCP_TRANSPORT',
  'MCP_HTTP_PORT',
  'MCP_HTTP_ENDPOINT',
  'MCP_HTTP_STATELESS',
  'MCP_HTTP_HOST',
  'MCP_BEARER_TOKEN',
] as const;

const ORIGINAL: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    ORIGINAL[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (ORIGINAL[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL[k];
  }
});

/** Minimal IncomingMessage stand-in carrying just an Authorization header. */
function reqWithAuth(authorization?: string | string[]): IncomingMessage {
  return { headers: authorization === undefined ? {} : { authorization } } as unknown as IncomingMessage;
}

// ============================================================================
// allowedBearerTokens
// ============================================================================

describe('allowedBearerTokens', () => {
  it('returns [] when MCP_BEARER_TOKEN is unset', () => {
    expect(allowedBearerTokens()).toEqual([]);
  });

  it('splits comma-separated tokens and trims whitespace', () => {
    process.env['MCP_BEARER_TOKEN'] = ' a , b ,c';
    expect(allowedBearerTokens()).toEqual(['a', 'b', 'c']);
  });

  it('drops empty entries', () => {
    process.env['MCP_BEARER_TOKEN'] = 'a,,  ,b';
    expect(allowedBearerTokens()).toEqual(['a', 'b']);
  });
});

// ============================================================================
// resolveTransportConfig — stdio is the untouched default
// ============================================================================

describe('resolveTransportConfig', () => {
  it('defaults to stdio when MCP_TRANSPORT is unset', () => {
    expect(resolveTransportConfig()).toEqual({ transportType: 'stdio' });
  });

  it('treats any non-httpStream value as stdio', () => {
    process.env['MCP_TRANSPORT'] = 'sse';
    expect(resolveTransportConfig()).toEqual({ transportType: 'stdio' });
  });

  it('resolves httpStream with documented defaults (loopback host)', () => {
    process.env['MCP_TRANSPORT'] = 'httpStream';
    expect(resolveTransportConfig()).toEqual({
      transportType: 'httpStream',
      httpStream: { host: '127.0.0.1', port: 8080, endpoint: '/mcp', stateless: false },
    });
  });

  it('honors MCP_HTTP_PORT / MCP_HTTP_ENDPOINT / MCP_HTTP_STATELESS', () => {
    process.env['MCP_TRANSPORT'] = 'httpStream';
    process.env['MCP_HTTP_PORT'] = '9099';
    process.env['MCP_HTTP_ENDPOINT'] = 'connector';
    process.env['MCP_HTTP_STATELESS'] = 'true';
    expect(resolveTransportConfig()).toEqual({
      transportType: 'httpStream',
      // endpoint is coerced to start with a slash
      httpStream: { host: '127.0.0.1', port: 9099, endpoint: '/connector', stateless: true },
    });
  });

  it('defaults httpStream host to loopback (127.0.0.1), not all-interfaces', () => {
    process.env['MCP_TRANSPORT'] = 'httpStream';
    const c = resolveTransportConfig();
    expect(c.transportType === 'httpStream' && c.httpStream.host).toBe('127.0.0.1');
  });

  it('honors an explicit MCP_HTTP_HOST override (operator opt-in to a wider bind)', () => {
    process.env['MCP_TRANSPORT'] = 'httpStream';
    process.env['MCP_HTTP_HOST'] = '0.0.0.0';
    const c = resolveTransportConfig();
    expect(c.transportType === 'httpStream' && c.httpStream.host).toBe('0.0.0.0');
  });

  it('parses common truthy stateless spellings but not arbitrary strings', () => {
    process.env['MCP_TRANSPORT'] = 'httpStream';
    for (const truthy of ['1', 'true', 'yes', 'YES']) {
      process.env['MCP_HTTP_STATELESS'] = truthy;
      const c = resolveTransportConfig();
      expect(c.transportType === 'httpStream' && c.httpStream.stateless).toBe(true);
    }
    process.env['MCP_HTTP_STATELESS'] = 'nope';
    const c = resolveTransportConfig();
    expect(c.transportType === 'httpStream' && c.httpStream.stateless).toBe(false);
  });
});

// ============================================================================
// assertRemoteAuthConfigured — fail closed before server.start()
// ============================================================================

describe('assertRemoteAuthConfigured', () => {
  it('is a no-op for stdio regardless of bearer config', () => {
    expect(() => assertRemoteAuthConfigured('svc', { transportType: 'stdio' })).not.toThrow();
  });

  it('throws for httpStream when no bearer token is configured', () => {
    const httpStream = {
      transportType: 'httpStream' as const,
      httpStream: { host: '127.0.0.1', port: 8080, endpoint: '/mcp' as const, stateless: false },
    };
    expect(() => assertRemoteAuthConfigured('svc', httpStream)).toThrow(/without MCP_BEARER_TOKEN/);
  });

  it('permits httpStream once at least one bearer token is present', () => {
    process.env['MCP_BEARER_TOKEN'] = 'secret';
    const httpStream = {
      transportType: 'httpStream' as const,
      httpStream: { host: '127.0.0.1', port: 8080, endpoint: '/mcp' as const, stateless: false },
    };
    expect(() => assertRemoteAuthConfigured('svc', httpStream)).not.toThrow();
  });
});

// ============================================================================
// buildBearerAuthenticator — per-request 401 gate
// ============================================================================

describe('buildBearerAuthenticator', () => {
  const VALID = 'dcyfr-mcp-test-token-abc123';

  beforeEach(() => {
    process.env['MCP_BEARER_TOKEN'] = VALID;
  });

  it('authorizes a request carrying a valid Bearer token', async () => {
    const authenticate = buildBearerAuthenticator();
    await expect(authenticate(reqWithAuth(`Bearer ${VALID}`))).resolves.toEqual({ authenticated: true });
  });

  it('rejects a request with no Authorization header (401)', async () => {
    const authenticate = buildBearerAuthenticator();
    const thrown = await authenticate(reqWithAuth()).then(
      () => null,
      (e) => e,
    );
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(401);
  });

  it('rejects a wrong token (401)', async () => {
    const authenticate = buildBearerAuthenticator();
    const thrown = await authenticate(reqWithAuth('Bearer wrong-token')).then(
      () => null,
      (e) => e,
    );
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(401);
  });

  it('is case-sensitive on the token value', async () => {
    const authenticate = buildBearerAuthenticator();
    await expect(authenticate(reqWithAuth(`Bearer ${VALID.toUpperCase()}`))).rejects.toBeInstanceOf(Response);
  });

  it('rejects when no bearer tokens are configured (fail closed)', async () => {
    delete process.env['MCP_BEARER_TOKEN'];
    const authenticate = buildBearerAuthenticator();
    await expect(authenticate(reqWithAuth(`Bearer ${VALID}`))).rejects.toBeInstanceOf(Response);
  });

  it('reads the first value when the header arrives as an array', async () => {
    const authenticate = buildBearerAuthenticator();
    await expect(authenticate(reqWithAuth([`Bearer ${VALID}`, 'Bearer other']))).resolves.toEqual({
      authenticated: true,
    });
  });
});

// ============================================================================
// describeTransport — startup banner
// ============================================================================

describe('describeTransport', () => {
  it('describes stdio mode', () => {
    expect(describeTransport('svc', { transportType: 'stdio' })).toContain('stdio');
  });

  it('describes httpStream with the ACTUAL host (not a hardcoded 0.0.0.0), port, endpoint, and the auth note', () => {
    const banner = describeTransport('svc', {
      transportType: 'httpStream',
      httpStream: { host: '127.0.0.1', port: 8080, endpoint: '/mcp', stateless: false },
    });
    expect(banner).toContain('127.0.0.1:8080/mcp');
    expect(banner).not.toContain('0.0.0.0');
    expect(banner).toContain('bearer auth enforced');
  });
});
