import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import lock from '../fixtures/collection/source-lock.json';
import { parseEffectV1Source, normalizeEffectV1ToTemplate } from '../index';
it('admits the supplied collection with its complete layout metadata and locked source bytes', () => {
  expect(lock.files).toHaveLength(21);
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
  expect(layouts).toBe(6);
});

it('matches every accepted and rejected SDK workflow case', async () => {
  const { default: manifest } = await import('../fixtures/collection/workflow-manifest.json');
  const bytes = readFileSync(
    new URL('../fixtures/collection/workflow-manifest.json', import.meta.url)
  );
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(lock.workflowManifestSha256);
  for (const entry of manifest.entries) {
    const source = readFileSync(
      new URL(`../fixtures/collection/${entry.artifact}`, import.meta.url)
    );
    expect(createHash('sha256').update(source).digest('hex')).toBe(entry.sha256);
    const result = parseEffectV1Source(source.toString('utf8'));
    expect(Boolean(result.document), entry.artifact).toBe(entry.accepted);
    for (const code of entry.diagnostics) {
      expect(
        result.diagnostics.map((item) => item.code),
        entry.artifact
      ).toContain(code);
    }
  }
});
