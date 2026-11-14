import { openDB } from 'idb';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createVectorLibraryTestHarness, vectorTestState } from './test-support';
import { createEditorVectorLibrary } from './library';
import { createEditorVectorDownloads } from './downloads';
import { isEditorVectorDownloadPrefix } from './contracts';
import { isEditorVectorSourceToken } from '../../../features/editor/vector-catalog';
import {
  isEditorVectorDefinition,
  computeEditorVectorDefinitionDigest,
} from '../../../features/editor/document/vector-element';
let harness: Awaited<ReturnType<typeof createVectorLibraryTestHarness>>;
const service = () =>
  createEditorVectorLibrary({
    validateDefinition: async (value) => {
      if (!isEditorVectorDefinition(value)) throw new Error('profile refused');
      return value;
    },
  });
beforeEach(async () => {
  harness = await createVectorLibraryTestHarness(openDB);
});
afterEach(() => harness.close());

it('resumes accepted chunks and keeps manifests partial until every name is local', async () => {
  const library = service();
  const downloads = createEditorVectorDownloads(library);
  const collection = await library.createCollection({ id: 'set', name: 'Set' });
  const token = await downloads.begin({ collection, manifest: ['b', 'a', 'a'] });
  const first = await downloads.acceptBatch(token, [{ name: 'a', definition: harness.definition }]);
  expect(first.state).toMatchObject({
    manifest: ['a', 'b'],
    status: 'partial',
    accepted: { a: harness.definition.id },
  });
  await downloads.fail(token, 'network-error');
  const resumed = await downloads.resume(token);
  const other = { ...harness.definition, id: '', svg: '<svg id="b"/>' };
  other.id = await computeEditorVectorDefinitionDigest(other);
  const result = await downloads.acceptBatch(resumed, [{ name: 'b', definition: other }]);
  expect(result.state?.status).toBe('ready');
  expect(vectorTestState.bytes.size).toBe(2);
  await downloads.acceptBatch(resumed, [{ name: 'b', definition: other }]);
  expect(vectorTestState.bytes.size).toBe(2);
  await downloads.fail(resumed, 'late-error');
  expect((await downloads.inspect('set'))?.status).toBe('ready');
});

it('preserves accepted siblings after unsupported content and refuses a canceled attempt', async () => {
  const library = service();
  const downloads = createEditorVectorDownloads(library);
  const collection = await library.createCollection({ id: 'set', name: 'Set' });
  const token = await downloads.begin({ collection, manifest: ['a', 'b'] });
  const result = await downloads.acceptBatch(token, [
    { name: 'a', definition: harness.definition },
    { name: 'b', definition: { unsafe: true } },
  ]);
  expect(result.accepted).toEqual(['a']);
  expect(result.rejected).toEqual([{ name: 'b', code: 'definition-refused' }]);
  expect(result.state?.status).toBe('partial');
  expect(vectorTestState.bytes.size).toBe(1);
  await downloads.cancel(token);
  await expect(
    downloads.acceptBatch(token, [{ name: 'b', definition: harness.definition }])
  ).rejects.toThrow('superseded');
});

it('deletion and recreation of a collection refuse delayed publication from the old generation', async () => {
  const library = service();
  const downloads = createEditorVectorDownloads(library);
  const collection = await library.createCollection({ id: 'set', name: 'Set' });
  const token = await downloads.begin({ collection, manifest: ['a'] });
  await library.removeCollection(collection.id, collection.incarnation);
  const replacement = await library.createCollection({ id: 'set', name: 'Replacement' });
  await expect(
    downloads.acceptBatch(token, [{ name: 'a', definition: harness.definition }])
  ).rejects.toThrow('superseded');
  expect((await library.readCatalog()).collections).toEqual([replacement]);
  expect(vectorTestState.bytes.size).toBe(0);
});

it('source disable refuses pending download publication without accepting stale resources', async () => {
  const library = service();
  const downloads = createEditorVectorDownloads(library);
  const settings = await library.updateSettings(
    { networkEnabled: true, disclosureAccepted: true },
    await library.readSettings()
  );
  const collection = await library.createCollection({ id: 'set', name: 'Set' });
  const admission = await library.captureAdmission();
  const token = await downloads.begin({ collection, source: admission.source!, manifest: ['a'] });
  await library.updateSettings({ networkEnabled: false }, settings);
  await expect(
    downloads.acceptBatch(token, [{ name: 'a', definition: harness.definition }])
  ).rejects.toThrow('superseded');
  expect(vectorTestState.bytes.size).toBe(0);
});

it('treats prototype property names as unaccepted manifest names until a real publication commits', async () => {
  const library = service();
  const downloads = createEditorVectorDownloads(library);
  const collection = await library.createCollection({ id: 'prototype', name: 'Prototype names' });
  const token = await downloads.begin({ collection, manifest: ['constructor'] });
  expect((await downloads.inspect(collection.id))?.status).toBe('downloading');
  const result = await downloads.acceptBatch(token, [
    { name: 'constructor', definition: harness.definition },
  ]);
  expect(result.state?.status).toBe('ready');
  expect(result.state?.accepted['constructor']).toBe(harness.definition.id);
});

it('keeps legacy rows readable and persists a bounded provider prefix through resume', async () => {
  const library = service();
  const downloads = createEditorVectorDownloads(library);
  const legacy = await library.createCollection({ id: 'legacy-prefix', name: 'Legacy' });
  await downloads.begin({ collection: legacy, manifest: ['a'] });
  const beforeRead = await harness.db.get('editor_vector_library', `download:${legacy.id}`);
  expect((await downloads.inspect(legacy.id))?.prefix).toBeUndefined();
  expect(await harness.db.get('editor_vector_library', `download:${legacy.id}`)).toEqual(
    beforeRead
  );
  const collection = await library.createCollection({ id: 'explicit-prefix', name: 'Explicit' });
  const prefix = 'a'.repeat(128);
  const token = await downloads.begin({ collection, manifest: ['a'], prefix });
  await downloads.resume(token);
  expect((await downloads.inspect(collection.id))?.prefix).toBe(prefix);
  const accepted = await downloads.inspect(collection.id);
  for (const invalid of ['a'.repeat(129), 'BadPrefix', 'bad:prefix']) {
    await expect(downloads.begin({ collection, manifest: ['a'], prefix: invalid })).rejects.toThrow(
      'prefix'
    );
  }
  expect(await downloads.inspect(collection.id)).toEqual(accepted);
});

it('parallel download starts preserve the final prefix and refuse the superseded attempt', async () => {
  const library = service();
  const downloads = createEditorVectorDownloads(library);
  const collection = await library.createCollection({ id: 'parallel-prefix', name: 'Parallel' });
  const tokens = await Promise.all([
    downloads.begin({ collection, manifest: ['a'], prefix: 'first' }),
    downloads.begin({ collection, manifest: ['a'], prefix: 'second' }),
  ]);
  const latest = await downloads.inspect(collection.id);
  const current = tokens.find((token) => token.incarnation === latest?.incarnation);
  const superseded = tokens.find((token) => token.incarnation !== latest?.incarnation);
  if (!current || !superseded || !latest) throw new Error('Missing ordered download attempts.');
  expect(latest.prefix).toBe(current === tokens[0] ? 'first' : 'second');
  await expect(
    downloads.acceptBatch(superseded, [{ name: 'a', definition: harness.definition }])
  ).rejects.toThrow('superseded');
  await downloads.acceptBatch(current, [{ name: 'a', definition: harness.definition }]);
  expect((await downloads.inspect(collection.id))?.prefix).toBe(latest.prefix);
  expect((await downloads.inspect(collection.id))?.status).toBe('ready');
});

it('rejects exactly the existing C0 control range in metadata tokens and manifest names', async () => {
  const library = service();
  const downloads = createEditorVectorDownloads(library);
  const collection = await library.createCollection({ id: 'control-scope', name: 'Controls' });
  for (let point = 0; point < 32; point++) {
    const value = `name${String.fromCharCode(point)}`;
    expect(
      isEditorVectorSourceToken({
        sourceId: 'https://api.iconify.design/',
        incarnation: value,
        generation: 1,
      })
    ).toBe(false);
    await expect(downloads.begin({ collection, manifest: [value] })).rejects.toThrow('manifest');
  }
  for (const point of [32, 127, 128, 159, 0x2028]) {
    const value = `name${String.fromCharCode(point)}`;
    expect(
      isEditorVectorSourceToken({
        sourceId: 'https://api.iconify.design/',
        incarnation: value,
        generation: 1,
      })
    ).toBe(true);
    await downloads.begin({ collection, manifest: [value] });
    expect((await downloads.inspect(collection.id))?.manifest).toEqual([value]);
  }
});

it('preserves the bounded lowercase catalog prefix grammar without ambiguous regex repetition', () => {
  for (const value of ['a', '0', 'a-b2', 'a'.repeat(128)])
    expect(isEditorVectorDownloadPrefix(value)).toBe(true);
  for (const value of [
    '',
    '-a',
    'a-',
    'a--b',
    'A',
    'a_b',
    'a:b',
    'a.b',
    'a b',
    'é',
    'a'.repeat(129),
    `a${String.fromCharCode(10)}`,
  ])
    expect(isEditorVectorDownloadPrefix(value)).toBe(false);
  for (const value of [null, undefined, 12, {}, []])
    expect(isEditorVectorDownloadPrefix(value)).toBe(false);
});
