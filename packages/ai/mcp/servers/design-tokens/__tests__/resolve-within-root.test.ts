/**
 * File-read sandbox for the design-tokens MCP server.
 *
 * `tokens:checkCompliance` and `tokens:analyzeFile` read a caller-supplied
 * path. `resolveWithinRoot` confines that read to the project root so an
 * authenticated bearer holder cannot turn the tool into an arbitrary-file-read
 * oracle (dcyfr-mcp-remote-serving TLP:AMBER sign-off, condition 2.1b).
 */

import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { resolveWithinRoot } from '../index.js';

const ROOT = path.resolve('/home/app/project');

describe('resolveWithinRoot', () => {
  it('resolves an in-root relative path under the root', () => {
    expect(resolveWithinRoot('src/lib/design-tokens.ts', ROOT)).toBe(
      path.join(ROOT, 'src/lib/design-tokens.ts')
    );
  });

  it('allows an absolute path that is inside the root', () => {
    const inside = path.join(ROOT, 'src/a.ts');
    expect(resolveWithinRoot(inside, ROOT)).toBe(inside);
  });

  it('allows the root itself', () => {
    expect(resolveWithinRoot('.', ROOT)).toBe(ROOT);
  });

  it('rejects a relative ../ traversal escaping the root', () => {
    expect(() => resolveWithinRoot('../../etc/passwd', ROOT)).toThrow(/outside the project root/);
  });

  it('rejects an absolute path outside the root', () => {
    expect(() => resolveWithinRoot('/etc/passwd', ROOT)).toThrow(/outside the project root/);
  });

  it('rejects a normalized path that escapes the root after `..` segments', () => {
    expect(() => resolveWithinRoot('src/../../secrets.env', ROOT)).toThrow(
      /outside the project root/
    );
  });

  it('rejects a sibling directory sharing a name prefix (no partial-prefix bypass)', () => {
    // `/home/app/project-secrets` must NOT be treated as inside `/home/app/project`.
    expect(() => resolveWithinRoot('../project-secrets/x', ROOT)).toThrow(
      /outside the project root/
    );
  });
});
