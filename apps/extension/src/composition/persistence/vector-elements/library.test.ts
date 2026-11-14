import { openDB } from 'idb';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createVectorLibraryTestHarness, vectorTestState } from './test-support';
import { createEditorVectorLibrary, readEditorVectorSettings } from './library';
import {
  isEditorVectorDefinition,
  computeEditorVectorDefinitionDigest,
} from '../../../features/editor/document/vector-element';
import { acquireAssetResourceSession } from '../assets/resource-sessions';
import { completePhysicalDeleteOperation } from '../assets/operations';

let harness: Awaited<ReturnType<typeof createVectorLibraryTestHarness>>;
const validateDefinition = async (value: unknown) => {
  if (!isEditorVectorDefinition(value)) throw new Error('profile refused');
  return value;
};
const service = () => createEditorVectorLibrary({ validateDefinition });
beforeEach(async () => {
  harness = await createVectorLibraryTestHarness(openDB);
});
afterEach(() => harness.close());

it('keeps imported, favorite, used, collection and preset data across service reconstruction', async () => {
  const library = service();
  const collection = await library.createCollection({ id: 'local', name: 'Local' });
  await library.importDefinition(harness.definition, {
    collection: { id: collection.id, incarnation: collection.incarnation },
    name: 'custom.svg',
  });
  await library.setFavorite(harness.definition.id, true);
  await library.markUsed(harness.definition.id);
  const preset = await library.savePreset(
    { id: 'blue', name: 'Blue', style: { kind: 'monochrome', color: '#0000ff' } },
    null
  );
  const reopened = service();
  const catalog = await reopened.readCatalog();
  expect(catalog.items).toMatchObject([
    {
      definitionId: harness.definition.id,
      favorite: true,
      usedAt: expect.any(Number),
      name: 'custom.svg',
    },
  ]);
  expect(catalog.collections).toEqual([collection]);
  expect(catalog.presets).toEqual([preset]);
  expect(catalog.members).toMatchObject([
    { collectionId: 'local', definitionId: harness.definition.id },
  ]);
  expect(await reopened.readDefinition(harness.definition.id)).toEqual(harness.definition);
});

it('parallel favorites preserve independent items and false preserves imported membership', async () => {
  const library = service();
  const other = { ...harness.definition, id: '', svg: '<svg id="other"/>' };
  other.id = await computeEditorVectorDefinitionDigest(other);
  await library.importDefinition(harness.definition);
  await library.importDefinition(other);
  await Promise.all([
    library.setFavorite(harness.definition.id, true),
    library.setFavorite(other.id, true),
  ]);
  expect((await library.readCatalog()).items.every((item) => item.favorite)).toBe(true);
  await library.setFavorite(harness.definition.id, false);
  expect(
    (await library.readCatalog()).items.find((item) => item.definitionId === harness.definition.id)
  ).toMatchObject({ favorite: false, imported: true });
});

it('refuses delayed favorite after item removal and recreation without changing the replacement', async () => {
  const library = service();
  await library.importDefinition(harness.definition);
  const reader = await acquireAssetResourceSession();
  let started!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const delayed = createEditorVectorLibrary({
    validateDefinition: async (value) => {
      started();
      await held;
      return validateDefinition(value);
    },
  });
  const pending = delayed.setFavorite(harness.definition.id, true);
  await entered;
  await library.removeItem(harness.definition.id);
  await library.importDefinition(harness.definition);
  const before = await library.readCatalog();
  release();
  await expect(pending).rejects.toThrow('superseded');
  expect(await library.readCatalog()).toEqual(before);
  await reader.release();
});

it('source settings default to enabled and reject stale publication after source changes', async () => {
  const library = service();
  const original = await readEditorVectorSettings();
  expect(original).toMatchObject({ networkEnabled: true, disclosureAccepted: true, revision: 0 });
  const enabled = await library.updateSettings(
    { networkEnabled: true, disclosureAccepted: true },
    original
  );
  const admission = await library.captureAdmission(harness.definition.id);
  expect(admission.source).toMatchObject({
    sourceId: enabled.baseUrl,
    generation: enabled.sourceGeneration,
  });
  const disabled = await library.updateSettings({ networkEnabled: false }, enabled);
  await expect(
    library.importDefinition(harness.definition, { source: admission.source! })
  ).rejects.toThrow('superseded');
  expect((await library.readCatalog()).items).toEqual([]);
  expect(vectorTestState.bytes.size).toBe(0);
  const changed = await library.updateSettings(
    { baseUrl: 'https://example.test/icons/v1' },
    disabled
  );
  expect(changed.baseUrl).toBe('https://example.test/icons/v1/');
  expect(changed.sourceGeneration).toBeGreaterThan(disabled.sourceGeneration);
  await expect(library.updateSettings({ networkEnabled: true }, enabled)).rejects.toThrow(
    'superseded'
  );
});

it('collection deletion and recreation reject an old import token without publishing stale bytes', async () => {
  const library = service();
  const collection = await library.createCollection({ id: 'icons', name: 'Icons' });
  const admission = await library.captureAdmission(harness.definition.id, collection.id);
  await library.removeCollection(collection.id, collection.incarnation);
  const replacement = await library.createCollection({ id: 'icons', name: 'New icons' });
  await expect(
    library.importDefinition(harness.definition, { collection: admission.collection! })
  ).rejects.toThrow('superseded');
  expect((await library.readCatalog()).collections).toEqual([replacement]);
  expect(vectorTestState.bytes.size).toBe(0);
});

it('metadata deletion preserves a saved project owner and preset tombstones reject delayed writes', async () => {
  const library = service();
  const collection = await library.createCollection({ id: 'icons', name: 'Icons' });
  const ref = await library.importDefinition(harness.definition, {
    collection: { id: collection.id, incarnation: collection.incarnation },
  });
  await harness.db.put('asset_owners', {
    ownerKind: 'image-workspace',
    ownerId: 'saved',
    role: `vector:${harness.definition.id}`,
    assetId: ref.assetId,
  });
  await library.removeCollection(collection.id, collection.incarnation);
  for (const operation of await harness.db.getAll('asset_operations'))
    await completePhysicalDeleteOperation(operation);
  expect(vectorTestState.bytes.has(ref.assetId)).toBe(true);
  const preset = await library.savePreset(
    { id: 'color', name: 'Color', style: { kind: 'monochrome', color: '#ffffff' } },
    null
  );
  await library.removePreset(preset.id, preset.incarnation);
  await expect(library.savePreset({ ...preset, name: 'Delayed' }, preset)).rejects.toThrow(
    'superseded'
  );
  expect((await library.readCatalog()).presets).toEqual([]);
});

it('refuses a paused import after collection deletion and recreation before ready publication', async () => {
  const library = service();
  const collection = await library.createCollection({ id: 'delayed', name: 'Delayed' });
  let entered!: () => void;
  let finish!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const suspended = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const delayed = createEditorVectorLibrary({
    validateDefinition: async (value) => {
      entered();
      await suspended;
      return validateDefinition(value);
    },
  });
  const pending = delayed.importDefinition(harness.definition, { collection });
  await started;
  await library.removeCollection(collection.id, collection.incarnation);
  const replacement = await library.createCollection({ id: 'delayed', name: 'Replacement' });
  finish();
  await expect(pending).rejects.toThrow('superseded');
  expect((await library.readCatalog()).collections).toEqual([replacement]);
  expect((await library.readCatalog()).items).toEqual([]);
  expect(vectorTestState.bytes.size).toBe(0);
});

it('refuses an invalid item identity without writing a corrupt metadata row', async () => {
  const library = service();
  await expect(library.removeItem('not-a-digest')).rejects.toThrow('identity');
  expect(await harness.db.count('editor_vector_library')).toBe(0);
});

it('renames a collection without changing membership and refuses invalid or superseded renames', async () => {
  const library = service();
  const collection = await library.createCollection({ id: 'rename', name: 'Original' });
  await library.importDefinition(harness.definition, { collection });
  const before = await library.readCatalog();
  await library.renameCollection(collection.id, collection.incarnation, '  Renamed  ');
  const renamed = await library.readCatalog();
  expect(renamed.collections).toEqual([
    { ...collection, name: 'Renamed', revision: collection.revision + 1 },
  ]);
  expect(renamed.items).toEqual(before.items);
  expect(renamed.members).toEqual(before.members);
  await expect(
    library.renameCollection(collection.id, collection.incarnation, '   ')
  ).rejects.toThrow('name');
  await expect(
    library.renameCollection(collection.id, 'superseded-incarnation', 'Stale')
  ).rejects.toThrow('superseded');
  expect(await library.readCatalog()).toEqual(renamed);
});

it('refuses unaccepted network access and unsafe source URLs without changing stored settings', async () => {
  const library = service();
  const original = await readEditorVectorSettings();
  await expect(
    library.updateSettings({ networkEnabled: true, disclosureAccepted: false }, original)
  ).rejects.toThrow('acceptance');
  for (const baseUrl of ['http://example.test/', 'https://user:password@example.test/']) {
    await expect(library.updateSettings({ baseUrl }, original)).rejects.toThrow('HTTPS');
    expect(await readEditorVectorSettings()).toEqual(original);
  }
  expect(await harness.db.count('editor_vector_library')).toBe(0);
});
