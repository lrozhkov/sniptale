import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import lock from '../fixtures/collection/source-lock.json';
import { parseEffectV1Source, normalizeEffectV1ToTemplate } from '../index';
it('admits the supplied collection with its complete layout metadata and locked source bytes', () => {
  expect(lock.files).toHaveLength(29);
  const schema = readFileSync(
    new URL('../fixtures/sniptale-effect-v1.schema.json', import.meta.url)
  );
  expect(createHash('sha256').update(schema).digest('hex')).toBe(lock.schemaSha256);
  let layouts = 0;
  for (const item of lock.files) {
    const bytes = readFileSync(new URL(`../fixtures/collection/${item.file}`, import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(item.sha256);
    const parsed = parseEffectV1Source(bytes.toString('utf8'));
    expect(parsed.diagnostics, item.file).toEqual([]);
    expect(parsed.document, item.file).toBeDefined();
    const document = parsed.document!;
    expect(normalizeEffectV1ToTemplate(document).effectV1).toMatchObject(
      document.objectLayout ? { objectLayout: document.objectLayout } : {}
    );
    if (document.objectLayout) layouts++;
  }
  expect(layouts).toBe(12);
});
