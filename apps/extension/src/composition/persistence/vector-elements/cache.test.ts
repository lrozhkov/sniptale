import { openDB } from 'idb';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createVectorLibraryTestHarness } from './test-support';
import { createEditorVectorCache } from './cache';
import { createEditorVectorLibrary } from './library';
import { isEditorVectorDefinition } from '../../../features/editor/document/vector-element';
let harness: Awaited<ReturnType<typeof createVectorLibraryTestHarness>>;
beforeEach(async () => {
  harness = await createVectorLibraryTestHarness(openDB);
});
afterEach(() => harness.close());
const key = (id: string) => ({
  sourceId: 'https://api.iconify.design/',
  kind: 'definition' as const,
  id,
});

it('clears and evicts advisory JSON without changing imported assets, membership or presets', async () => {
  let timestamp = 1;
  const cache = createEditorVectorCache({ now: () => timestamp, maxBytes: 30 });
  const library = createEditorVectorLibrary({
    validateDefinition: async (value) => {
      if (!isEditorVectorDefinition(value)) throw new Error('invalid');
      return value;
    },
  });
  await library.importDefinition(harness.definition);
  await library.savePreset(
    {
      id: 'retained-palette',
      name: 'Retained palette',
      style: { kind: 'monochrome', color: '#ffffff' },
    },
    null
  );
  const before = await library.readCatalog();
  await cache.put(key('a'), '1234567890');
  timestamp++;
  await cache.put(key('b'), '1234567890');
  timestamp++;
  await cache.touch(key('a'));
  timestamp++;
  await cache.put(key('c'), '1234567890');
  expect(await cache.read(key('b'))).toBeNull();
  expect(await cache.read(key('a'))).toBe('1234567890');
  await cache.clear();
  expect(await cache.read(key('a'))).toBeNull();
  expect(await cache.stats()).toEqual({ bytes: 0, entries: 0, budgetBytes: 30 });
  expect(await library.readCatalog()).toEqual(before);
});

it('expired reads are write-free and raw cached SVG stays unknown data without rendering authority', async () => {
  let timestamp = 1;
  const cache = createEditorVectorCache({ now: () => timestamp });
  const search = { ...key('query'), kind: 'search' as const };
  await cache.put(search, { names: ['a'] });
  await cache.put(key('raw'), { svg: '<svg onload="alert(1)"/>' });
  const count = await harness.db.count('editor_vector_library');
  timestamp += 15 * 60 * 1000;
  expect(await cache.read(search)).toBeNull();
  expect(await harness.db.count('editor_vector_library')).toBe(count);
  expect(await cache.read(key('raw'))).toEqual({ svg: '<svg onload="alert(1)"/>' });
  const stored = await harness.db.getAll('editor_vector_library');
  expect((await cache.stats()).entries).toBe(2);
  expect(await harness.db.getAll('editor_vector_library')).toEqual(stored);
  expect(await harness.db.count('asset_owners')).toBe(0);
});

it('counts stored valid cache bytes independently of authoritative rows and ignores malformed cache rows', async () => {
  const cache = createEditorVectorCache({ maxBytes: 1024 });
  const first = { name: 'Пример' },
    second = ['geometry', 12];
  await cache.put(key('first'), first);
  await cache.put(key('second'), second);
  await harness.db.put('editor_vector_library', {
    key: 'cache:invalid',
    kind: 'cache',
    size: -1,
    payload: 'invalid',
  });
  await harness.db.put('editor_vector_library', {
    key: 'item:unrelated',
    kind: 'item',
    payload: 'authoritative user data',
  });
  expect(await cache.stats()).toEqual({
    bytes:
      new TextEncoder().encode(JSON.stringify(first)).byteLength +
      new TextEncoder().encode(JSON.stringify(second)).byteLength,
    entries: 2,
    budgetBytes: 1024,
  });
});

it('refuses unsupported and oversized payloads without replacing an accepted cache entry', async () => {
  const cache = createEditorVectorCache({ maxBytes: 32 });
  expect(await cache.put(key('accepted'), { name: 'accepted' })).toBe(true);
  const before = await cache.stats();
  for (const payload of [undefined, 'x'.repeat(33)]) {
    expect(await cache.put(key('accepted'), payload)).toBe(false);
    expect(await cache.read(key('accepted'))).toEqual({ name: 'accepted' });
    expect(await cache.stats()).toEqual(before);
  }
});

it('expires collection listings at one day and removes expired rows when replacing a definition', async () => {
  let timestamp = 1;
  const cache = createEditorVectorCache({ now: () => timestamp });
  const collections = { ...key('listing'), kind: 'collections' as const };
  expect(await cache.put(collections, ['local'])).toBe(true);
  expect(await cache.put(key('definition'), { version: 1 })).toBe(true);
  timestamp += 24 * 60 * 60 * 1000 - 1;
  expect(await cache.read(collections)).toEqual(['local']);
  timestamp++;
  expect(await cache.read(collections)).toBeNull();
  expect(await cache.put(key('definition'), { version: 2 })).toBe(true);
  expect(await cache.read(key('definition'))).toEqual({ version: 2 });
  expect((await cache.stats()).entries).toBe(1);
});
