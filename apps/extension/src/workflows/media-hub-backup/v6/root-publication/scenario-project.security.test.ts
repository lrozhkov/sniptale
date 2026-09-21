import { beforeEach, expect, it, vi } from 'vitest';
import { createGuideProject } from '../../../../features/scenario/project/public';
import type { AssetRef, ArchiveRestoreSession } from '../../../../composition/persistence/assets';
import {
  encodePortableScenarioProjectEntry,
  parsePortableScenarioProjectMetadata,
} from '../root-codecs/projects';

const io = vi.hoisted(() => ({ mutate: vi.fn(), checkpoint: vi.fn() }));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: io.mutate,
}));
vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  appendCommittedArchiveRootInTransaction: io.checkpoint,
}));
import { scenarioProjectRootPublisher } from './scenario-project';
import { prepareScenarioProjectPublication } from './scenario-project-publication';

beforeEach(() => vi.clearAllMocks());

function session(rootIdMap: Record<string, string> = {}): ArchiveRestoreSession {
  return {
    archiveFingerprint: 'a'.repeat(64),
    childIdMap: {},
    committedRoots: [],
    conflictedRoots: [],
    createdAt: 1,
    currentRoot: 'scenario-project:guide',
    kind: 'archive-restore-session',
    operationId: 'restore',
    rootIdMap,
    skippedRoots: [],
    status: 'pending',
    strategy: 'duplicate',
    updatedAt: 1,
  };
}

interface ScenarioMetadataFixture {
  assets: Array<{
    entry: Record<string, unknown> & { galleryAssetId: string | null };
    objectId: string;
  }>;
  entry: Record<string, unknown>;
  exports: Array<Record<string, unknown>>;
  exportThumbnails: Array<Record<string, unknown>>;
  stepDocuments: Array<Record<string, unknown>>;
}

function metadata(): ScenarioMetadataFixture {
  const project = createGuideProject('Hostile', 'guide', 1);
  const { history: _history, ...entry } = encodePortableScenarioProjectEntry({
    id: 'guide',
    project,
    createdAt: 1,
    updatedAt: 1,
    workspaceRevision: 1,
  });
  return {
    assets: [
      {
        entry: {
          id: 'image',
          projectId: 'guide',
          galleryAssetId: null,
          mimeType: 'image/png',
          width: 10,
          height: 10,
          createdAt: 1,
          size: 4,
        },
        objectId: 'image-object',
      },
    ],
    entry,
    exports: [],
    exportThumbnails: [],
    stepDocuments: [],
  };
}

function imageObject() {
  const ref: AssetRef = {
    assetId: 'physical-image',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/physical-image' },
    mimeType: 'image/png',
    sha256: null,
    size: 4,
  };
  return { objectId: 'image-object', ref };
}

type PublishArgs = Parameters<typeof scenarioProjectRootPublisher.publish>[0];

function publishArgs(value: unknown): PublishArgs {
  return {
    envelope: {
      descriptor: {
        rootKind: 'scenario-project',
        rootId: 'guide',
        metadataPath: '_sniptale/metadata/scenario-projects/guide.json',
        objectCount: 0,
        totalBytes: 0,
      },
      metadata: JSON.parse(JSON.stringify(value)) as PublishArgs['envelope']['metadata'],
      objects: [],
    },
    journal: {
      assetRefs: [],
      createdAt: 1,
      domain: 'archive-restore',
      journalId: 'journal',
      payload: {},
    },
    session: session(),
    staged: [],
  };
}

it('clears an unmapped gallery provenance id before persistence and later backup traversal', async () => {
  const value = metadata();
  value.assets[0]!.entry.galleryAssetId = 'attacker-local-gallery-id';
  const prepared = await prepareScenarioProjectPublication({
    metadata: parsePortableScenarioProjectMetadata(value),
    rootId: 'guide',
    session: session(),
    sourceExists: false,
    staged: [imageObject()],
  });

  expect(prepared.root.assets[0]!.entry.galleryAssetId).toBeNull();
  expect(JSON.stringify(prepared.root)).not.toContain('attacker-local-gallery-id');
});

it('keeps gallery provenance only after resolving it through the admitted root map', async () => {
  const value = metadata();
  value.assets[0]!.entry.galleryAssetId = 'portable-gallery-id';
  const prepared = await prepareScenarioProjectPublication({
    metadata: parsePortableScenarioProjectMetadata(value),
    rootId: 'guide',
    session: session({ 'media:library-item:portable-gallery-id': 'restored-gallery-id' }),
    sourceExists: false,
    staged: [imageObject()],
  });

  expect(prepared.root.assets[0]!.entry.galleryAssetId).toBe('restored-gallery-id');
});

it.each([
  {
    label: 'scenario asset ids',
    hostile() {
      const value = metadata();
      value.assets.push(structuredClone(value.assets[0]!));
      return value;
    },
  },
  {
    label: 'scenario export ids',
    hostile() {
      const value = metadata();
      value.exports = [{ id: 'export' }, { id: 'export' }];
      return value;
    },
  },
  {
    label: 'step document ids',
    hostile() {
      const value = metadata();
      const document = { projectId: 'guide', stepId: 'step', document: { assets: [] } };
      value.stepDocuments = [document, structuredClone(document)];
      return value;
    },
  },
  {
    label: 'export thumbnail targets',
    hostile() {
      const value = metadata();
      const thumbnail = { exportId: 'export', thumbnail: { objectId: 'thumbnail-object' } };
      value.exportThumbnails = [thumbnail, structuredClone(thumbnail)];
      return value;
    },
  },
])('rejects duplicate $label before mutation or retained authority', async ({ hostile }) => {
  io.mutate.mockImplementation(async (operation) => operation({ get: async () => undefined }));

  await expect(scenarioProjectRootPublisher.publish(publishArgs(hostile()))).rejects.toThrow(
    'Portable scenario project child identities are inconsistent.'
  );
  expect(io.mutate).not.toHaveBeenCalled();
  expect(io.checkpoint).not.toHaveBeenCalled();
});
