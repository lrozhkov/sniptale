import { beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
} from '../../../../features/scenario/project/public';
import { createPersistedEditorDocumentFixture } from '../../../../composition/persistence/document-assets/test-support';
import { createEditorDocumentFixture } from '../../../../editor/document/page-session/document.test-support';
import { encodePortableEditorDocument } from '../root-codecs/editor-document';
import {
  MAX_PORTABLE_SCENARIO_HISTORY_BYTES,
  encodePortableScenarioProjectEntry,
} from '../root-codecs/projects';
import type { AssetRef } from '../../../../composition/persistence/assets';
const io = vi.hoisted(() => ({
  mutate: vi.fn(),
  put: vi.fn(),
  read: vi.fn(),
  checkpoint: vi.fn(),
}));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: io.mutate,
}));
vi.mock('../../../../composition/persistence/scenario/backup-restore', () => ({
  putScenarioProjectBackupRestore: io.put,
}));
vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  readAssetFile: io.read,
  appendCommittedArchiveRootInTransaction: io.checkpoint,
}));
import { assertPortableJson } from '../codec';
import { scenarioProjectRootPublisher } from './scenario-project';
beforeEach(() => {
  vi.clearAllMocks();
  io.put.mockResolvedValue({ imported: true, conflicted: false });
  io.mutate.mockImplementation(async (operation) =>
    operation({
      get: async () => ({ id: 'guide' }),
      transaction: () => ({ objectStore: () => ({ put: vi.fn() }), done: Promise.resolve() }),
    })
  );
});
function input() {
  const project = createGuideProject('Old', 'guide', 1);
  const step = createGuideStep('Old image', 'step');
  step.blocks.push(
    createGuideImageBlock({
      id: 'image',
      assetId: 'logical-image',
      editDocumentId: 'annotations',
      width: 100,
      height: 50,
      source: { kind: 'import', filename: 'old.png' },
    })
  );
  project.items.push(step);
  const { history, ...entry } = encodePortableScenarioProjectEntry({
    id: 'guide',
    project: { ...project, updatedAt: 2, items: [] },
    createdAt: 1,
    updatedAt: 2,
    workspaceRevision: 2,
    history: [{ revision: 1, savedAt: 1, project }],
  });
  const historyBlob = new File([JSON.stringify(history)], 'saved-versions.json', {
    type: 'application/json',
  });
  io.read.mockResolvedValue(historyBlob);
  const ref = (assetId: string, mimeType: string, size: number): AssetRef => ({
    assetId,
    mimeType,
    size,
    createdAt: 1,
    sha256: null,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
  });
  const imageRef = ref('physical-image', 'image/png', 4);
  const historyRef = ref('physical-history', 'application/json', historyBlob.size);
  const document = encodePortableEditorDocument({
    document: createPersistedEditorDocumentFixture(createEditorDocumentFixture(), 'source'),
    objectsByAssetId: new Map([['source', 'image-object']]),
  });
  const metadata = {
    entry,
    historyObjectId: 'history-object',
    assets: [
      {
        entry: {
          id: 'logical-image',
          projectId: 'guide',
          galleryAssetId: null,
          mimeType: 'image/png',
          width: 100,
          height: 50,
          createdAt: 1,
          size: 4,
        },
        objectId: 'image-object',
      },
    ],
    exports: [],
    exportThumbnails: [],
    stepDocuments: [
      { stepId: 'annotations', projectId: 'guide', createdAt: 1, updatedAt: 1, document },
    ],
  };
  assertPortableJson(metadata);
  const args: Parameters<typeof scenarioProjectRootPublisher.publish>[0] = {
    envelope: {
      descriptor: {
        rootKind: 'scenario-project',
        rootId: 'guide',
        metadataPath: '_sniptale/metadata/guide.json',
        objectCount: 2,
        totalBytes: 4 + historyBlob.size,
      },
      metadata,
      objects: [],
    },
    journal: {
      assetRefs: [imageRef, historyRef],
      createdAt: 1,
      domain: 'archive-restore',
      journalId: 'journal',
      payload: {},
    },
    session: {
      archiveFingerprint: 'a'.repeat(64),
      committedRoots: [],
      conflictedRoots: [],
      createdAt: 1,
      currentRoot: 'scenario-project:guide',
      kind: 'archive-restore-session',
      operationId: 'restore',
      rootIdMap: {},
      skippedRoots: [],
      status: 'pending',
      strategy: 'duplicate',
      updatedAt: 1,
    },
    staged: [
      { objectId: 'image-object', ref: imageRef },
      { objectId: 'history-object', ref: historyRef },
    ],
  };
  return { args, history };
}
it('duplicates historical image/document identities and leaves consumed JSON for existing staged cleanup', async () => {
  const { args } = input();
  const result = await scenarioProjectRootPublisher.publish(args);
  const call = io.put.mock.calls[0]?.[0] as Parameters<
    typeof import('../../../../composition/persistence/scenario/backup-restore').putScenarioProjectBackupRestore
  >[0];
  const root = call.root;
  const previous = root.entry.history?.[0];
  expect(root.entry.id).not.toBe('guide');
  expect(previous?.project.id).toBe(root.entry.id);
  expect(root.entry.project.items).toEqual([]);
  const item = previous?.project.items[0];
  if (item?.kind !== 'step') throw new Error('Missing historical step');
  expect(item.blocks[0]).toMatchObject({
    assetId: root.assets[0]?.entry.id,
    editDocumentId: root.stepDocuments[0]?.entry.stepId,
  });
  expect(result.retainedAssetIds).toContain('physical-image');
  expect(result.retainedAssetIds).not.toContain('physical-history');
});
it('rejects foreign history before publishing any root', async () => {
  const { args, history } = input();
  const hostile = history?.map((version) => ({
    ...version,
    project: { ...(typeof version.project === 'object' ? version.project : {}), id: 'foreign' },
  }));
  io.read.mockResolvedValueOnce(new File([JSON.stringify(hostile)], 'saved-versions.json'));
  await expect(scenarioProjectRootPublisher.publish(args)).rejects.toThrow('history');
  expect(io.put).not.toHaveBeenCalled();
});
it('rejects an oversized history object before reading its contents', async () => {
  const { args } = input();
  const staged = args.staged[1];
  if (!staged) throw new Error('Missing history object');
  staged.ref.size = MAX_PORTABLE_SCENARIO_HISTORY_BYTES + 1;
  await expect(scenarioProjectRootPublisher.publish(args)).rejects.toThrow('limit');
  expect(io.read).not.toHaveBeenCalled();
  expect(io.put).not.toHaveBeenCalled();
});
