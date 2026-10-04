import { expect, it, vi } from 'vitest';
const read = vi.hoisted(() => vi.fn());
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
