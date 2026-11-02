import { beforeEach, expect, it, vi } from 'vitest';
const read = vi.hoisted(() => vi.fn());
beforeEach(() => {
  read.mockReset();
});
import type { AssetRef } from '../../../../composition/persistence/assets/contracts';
vi.mock('../../../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../../../composition/persistence/assets')>()),
  readAssetFile: read,
}));
import { createArchivePathAllocator } from '../../../../composition/archive-transfer';
import {
  createGuideProject,
  createGuideStep,
  createGuideParagraphs,
} from '../../../../features/scenario/project/public';
import { createMediaHubBackupExportOptions } from '../options';
import { MAX_ROOT_METADATA_BYTES } from '../contracts';
import { parseRootEnvelope } from '../codec';
import { parsePortableScenarioProjectMetadata } from '../root-codecs/projects';
import { buildScenarioProjectRootInventory } from './scenario-projects';
it('exports large saved history as a separate bounded object without inflating root metadata', async () => {
  const project = createGuideProject('Guide', 'guide', 1);
  const step = createGuideStep('Text', 'step');
  step.blocks.push({
    kind: 'text',
    id: 'text',
    paragraphs: createGuideParagraphs(Array(30).fill('x'.repeat(10_000)).join('\n')),
  });
  project.items.push(step);
  const entry = {
    id: project.id,
    project: { ...project, updatedAt: 21 },
    createdAt: 1,
    updatedAt: 21,
    workspaceRevision: 21,
    history: Array.from({ length: 20 }, (_, index) => ({
      revision: index + 1,
      savedAt: index + 1,
      project: { ...project, updatedAt: index + 1 },
    })),
  };
  const roots = await buildScenarioProjectRootInventory({
    db: {
      transaction: () => scenarioTransaction([entry]),
      get: async () => undefined,
      getAll: async (name) => (name === 'scenario_projects' ? [entry] : []),
      getAllFromIndex: async () => [],
    },
    options: createMediaHubBackupExportOptions(),
    paths: createArchivePathAllocator(),
  });
  const envelope = await roots[0]?.load();
  if (!envelope) throw new Error('Missing root');
  const metadata = parsePortableScenarioProjectMetadata(envelope.metadata);
  expect(new TextEncoder().encode(JSON.stringify(metadata)).byteLength).toBeLessThan(
    MAX_ROOT_METADATA_BYTES
  );
  expect(metadata.entry).not.toHaveProperty('history');
  const object = envelope.objects.find((item) => item.ref.objectId === metadata.historyObjectId);
  if (!object) throw new Error('Missing history object');
  expect(object.blob.size).toBeGreaterThan(MAX_ROOT_METADATA_BYTES);
  const history: unknown = JSON.parse(await object.blob.text());
  expect(history).toHaveLength(20);
  expect(object.ref.mimeType).toBe('application/json');
});

it.each(['guide', 'tour'] as const)(
  'archives immutable %s HTML bytes with its renamed catalogue and no local asset identity',
  async (mode) => {
    const project = createGuideProject('Current project changed', 'guide', 1);
    const blob = new File(['<html>Historical saved export</html>'], 'renamed.html', {
      type: 'text/html;charset=utf-8',
    });
    const ref = {
      assetId: 'local-body',
      createdAt: 1,
      location: { kind: 'opfs', objectKey: 'objects/local-body' },
      mimeType: blob.type,
      sha256: null,
      size: blob.size,
    };
    const saved = {
      id: 'saved',
      projectId: 'guide',
      filename: 'renamed.html',
      format: 'html',
      createdAt: 1,
      size: blob.size,
      html: { mode, assetId: ref.assetId },
    };
    const { html: _html, ...legacy } = { ...saved, id: 'legacy', filename: 'legacy.html' };
    read.mockResolvedValueOnce(blob);
    const roots = await buildScenarioProjectRootInventory({
      db: {
        transaction: () =>
          scenarioTransaction([
            { id: project.id, project, createdAt: 1, updatedAt: 1, workspaceRevision: 1 },
          ]),
        get: async (store) => (store === 'asset_refs' ? ref : undefined),
        getAll: async (store) =>
          store === 'scenario_projects'
            ? [{ id: project.id, project, createdAt: 1, updatedAt: 1, workspaceRevision: 1 }]
            : [],
        getAllFromIndex: async (store) => (store === 'scenario_exports' ? [saved, legacy] : []),
      },
      options: createMediaHubBackupExportOptions(),
      paths: createArchivePathAllocator(),
    });
    const envelope = await roots[0]!.load();
    expect(() =>
      parseRootEnvelope({
        descriptor: roots[0]!.descriptor,
        metadata: envelope.metadata,
        objects: envelope.objects.map((object) => object.ref),
      })
    ).not.toThrow();
    const metadata = parsePortableScenarioProjectMetadata(envelope.metadata);
    const exported = metadata.exports.find((item) => item.id === 'saved')!;
    const object = envelope.objects.find((item) => item.ref.objectId === exported.html?.objectId)!;
    expect(exported).toMatchObject({ filename: 'renamed.html', html: { mode } });
    expect(JSON.stringify(metadata)).not.toContain('local-body');
    expect(metadata.exports.find((item) => item.id === 'legacy')).not.toHaveProperty('html');
    expect(await object.blob.text()).toBe(await blob.text());
    expect(object.ref.path).toContain('/Exports/renamed.html');
    expect(read).toHaveBeenCalledWith(ref, 'renamed.html');
  }
);

it('exports a legacy canonical scenario snapshot with its replaced logical root relation', async () => {
  const project = createGuideProject('Scenario', 'scenario', 1);
  const asset = {
    id: 'captured',
    projectId: project.id,
    assetId: 'frozen-old',
    galleryAssetId: null,
    mimeType: 'image/png',
    size: 4,
    width: 100,
    height: 50,
    createdAt: 1,
  };
  const { createMediaLibraryEntry } =
    await import('../../../../composition/persistence/projects/index.test-support');
  const media = createMediaLibraryEntry({
    id: 'scenario-asset:captured',
    source: { kind: 'stored-asset', assetId: 'published-new' },
  });
  const ref = {
    assetId: asset.assetId,
    createdAt: 1,
    mimeType: asset.mimeType,
    size: 4,
    sha256: null,
    location: { kind: 'opfs' as const, objectKey: 'objects/frozen-old' },
  };
  read.mockResolvedValue(new File(['data'], 'old.png', { type: 'image/png' }));
  const roots = await buildScenarioProjectRootInventory({
    db: {
      transaction: () =>
        scenarioTransaction([
          { id: project.id, project, createdAt: 1, updatedAt: 1, workspaceRevision: 0 },
        ]),
      get: async (store) =>
        store === 'media_library' ? media : store === 'asset_refs' ? ref : undefined,
      getAll: async (store) =>
        store === 'scenario_projects'
          ? [{ id: project.id, project, createdAt: 1, updatedAt: 1, workspaceRevision: 0 }]
          : [],
      getAllFromIndex: async (store) => (store === 'scenario_assets' ? [asset] : []),
    },
    options: createMediaHubBackupExportOptions(),
    paths: createArchivePathAllocator(),
  });
  const envelope = await roots[0]!.load();
  const metadata = parsePortableScenarioProjectMetadata(envelope.metadata);
  expect(metadata.assets[0]!.entry.galleryAssetId).toBe(media.id);
  expect(metadata.assets[0]!.entry).not.toHaveProperty('borrowedMediaId');
});

function scenarioTransaction(projects: unknown[]) {
  return {
    objectStore: (name: string) => ({
      getAll: async () => (name === 'scenario_projects' ? projects : []),
    }),
    done: Promise.resolve(),
  };
}

function unloadedExportFixture() {
  const project = createGuideProject('Current authored project', 'guide', 1);
  const entry = { id: project.id, project, createdAt: 1, updatedAt: 2, workspaceRevision: 2 };
  const ref: AssetRef = {
    assetId: 'retained-html',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/retained-html' },
    size: 4096,
    mimeType: 'text/html;charset=utf-8',
    sha256: 'a'.repeat(64),
  };
  const saved = {
    id: 'historical',
    projectId: entry.id,
    filename: 'renamed saved export.html',
    format: 'html',
    createdAt: 1,
    size: ref.size,
    trashState: { updatedAt: 2, trashedAt: 2 },
    html: { mode: 'guide', assetId: ref.assetId },
  };
  const db = {
    transaction: () => scenarioTransaction([entry]),
    get: async (store: string) => (store === 'asset_refs' ? ref : undefined),
    getAll: async (store: string) => (store === 'scenario_projects' ? [entry] : []),
    getAllFromIndex: async (store: string) => (store === 'scenario_exports' ? [saved] : []),
  };
  return { ref, saved, db };
}

it('supports an explicit sync-only HTML descriptor without a body or fake ready object', async () => {
  const { ref, saved, db } = unloadedExportFixture();
  read.mockRejectedValue(new Error('Historical HTML must remain unloaded.'));
  const onObject = vi.fn();
  const roots = await buildScenarioProjectRootInventory({
    db,
    options: createMediaHubBackupExportOptions(),
    paths: createArchivePathAllocator(),
    deferredExports: { refs: new Map([[ref.assetId, ref]]), onObject },
  });
  const loaded = await roots[0]!.load();
  const metadata = parsePortableScenarioProjectMetadata(loaded.metadata);
  expect(metadata.exports[0]).toMatchObject({
    id: saved.id,
    filename: saved.filename,
    size: saved.size,
    createdAt: saved.createdAt,
    trashState: saved.trashState,
    html: { mode: 'guide' },
  });
  expect(loaded.objects).toEqual([]);
  expect(roots[0]!.descriptor).toMatchObject({ objectCount: 1, totalBytes: ref.size });
  expect(onObject).toHaveBeenCalledExactlyOnceWith(
    ref.assetId,
    expect.objectContaining({
      objectId: metadata.exports[0]!.html!.objectId,
      filename: saved.filename,
      size: ref.size,
      mimeType: 'text/html',
    })
  );
  expect(read).not.toHaveBeenCalled();
});

it('still requires original historical HTML bytes for an ordinary archive', async () => {
  const { db } = unloadedExportFixture();
  read.mockRejectedValue(new Error('Historical HTML is unavailable.'));
  await expect(
    buildScenarioProjectRootInventory({
      db,
      options: createMediaHubBackupExportOptions(),
      paths: createArchivePathAllocator(),
    })
  ).rejects.toThrow('Historical HTML is unavailable');
  expect(read).toHaveBeenCalledTimes(1);
});

it.each(['native-ref', 'size', 'mime'] as const)(
  'refuses a sync-only HTML descriptor with changed %s',
  async (kind) => {
    const { ref, db } = unloadedExportFixture();
    const candidate = {
      ...ref,
      ...(kind === 'native-ref'
        ? { createdAt: 2 }
        : kind === 'size'
          ? { size: 1 }
          : { mimeType: 'image/png' }),
    };
    await expect(
      buildScenarioProjectRootInventory({
        db,
        options: createMediaHubBackupExportOptions(),
        paths: createArchivePathAllocator(),
        deferredExports: { refs: new Map([[ref.assetId, candidate]]), onObject: vi.fn() },
      })
    ).rejects.toThrow('Deferred');
    expect(read).not.toHaveBeenCalled();
  }
);

it('retains a Scenario editing asset descriptor and keeps generated history as actual bytes', async () => {
  const project = createGuideProject('Deferred', 'scenario-deferred', 1);
  const step = createGuideStep('Text', 'step');
  step.blocks.push({ kind: 'text', id: 'text', paragraphs: createGuideParagraphs('saved') });
  project.items.push(step);
  const entry = {
    id: project.id,
    project: { ...project, updatedAt: 2 },
    createdAt: 1,
    updatedAt: 2,
    workspaceRevision: 2,
    history: [{ revision: 1, savedAt: 1, project }],
  };
  const native: AssetRef = {
    assetId: 'editing-resource',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/editing-resource' },
    mimeType: 'image/png',
    size: 4,
    sha256: 'a'.repeat(64),
  };
  const asset = {
    id: 'scenario-asset',
    projectId: entry.id,
    assetId: native.assetId,
    galleryAssetId: null,
    mimeType: native.mimeType,
    size: native.size,
    width: 100,
    height: 50,
    createdAt: 1,
  };
  const onObject = vi.fn();
  const roots = await buildScenarioProjectRootInventory({
    db: {
      transaction: () => scenarioTransaction([entry]),
      get: async (store, key) =>
        store === 'asset_refs' && key === native.assetId ? native : undefined,
      getAll: async (store) => (store === 'scenario_projects' ? [entry] : []),
      getAllFromIndex: async (store) => (store === 'scenario_assets' ? [asset] : []),
    },
    options: createMediaHubBackupExportOptions(),
    paths: createArchivePathAllocator(),
    deferredAssets: { refs: new Map([[native.assetId, native]]), onObject },
  });
  const loaded = await roots[0]!.load();
  const metadata = parsePortableScenarioProjectMetadata(loaded.metadata);
  expect(onObject).toHaveBeenCalledExactlyOnceWith(
    native.assetId,
    expect.objectContaining({ objectId: metadata.assets[0]!.objectId, size: 4 })
  );
  expect(loaded.objects).toHaveLength(1);
  expect(loaded.objects[0]!.ref.objectId).toBe(metadata.historyObjectId);
  expect(JSON.parse(await loaded.objects[0]!.blob.text())).toHaveLength(1);
  expect(roots[0]!.descriptor.objectCount).toBe(2);
  expect(read).not.toHaveBeenCalled();
});

it('shares Scenario export eligibility with Library preparation before any HTML read', async () => {
  const { isScenarioBackupProjectSelected } = await import('./scenario-projects');
  const options = createMediaHubBackupExportOptions({
    scope: 'selected',
    selected: { mediaAssetIds: [], scenarioProjectIds: ['included', 'draft'], videoProjectIds: [] },
  });
  expect(isScenarioBackupProjectSelected('included', undefined, options)).toBe(true);
  expect(isScenarioBackupProjectSelected('draft', { storageClass: 'temporary' }, options)).toBe(
    false
  );
  expect(isScenarioBackupProjectSelected('other', undefined, options)).toBe(false);
  expect(
    isScenarioBackupProjectSelected(
      'draft',
      { storageClass: 'temporary' },
      { ...options, includeDrafts: true }
    )
  ).toBe(true);
  expect(read).not.toHaveBeenCalled();
});
