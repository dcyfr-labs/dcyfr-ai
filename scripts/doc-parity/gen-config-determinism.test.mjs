import { test, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const genConfigSrc = readFileSync(join(here, 'gen-config.mjs'), 'utf8');

// Config determinism (Wave 1 task 1.6): the JSON Schema target must be pinned
// explicitly so a future zod bump cannot silently change z.toJSONSchema's
// default dialect and break the byte-identical config-parity gate. Source-level
// guard (no build needed) -- gen-config imports the COMPILED schema.
describe('gen-config schema determinism', () => {
  test('z.toJSONSchema is called with an explicit pinned `target`', () => {
    const m = genConfigSrc.match(/z\.toJSONSchema\([^;]*?\{([^}]*)\}\s*\)/s);
    expect(m, 'z.toJSONSchema(schema, { ... }) call not found in gen-config.mjs').not.toBeNull();
    expect(m[1]).toMatch(/target\s*:\s*['"][\w-]+['"]/);
  });
});
