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
import { assertPortableJson, parseRootEnvelope } from '../codec';
import { createArchiveMemorySink } from '../../../../composition/archive-transfer/test-support';
import { openArchiveReader } from '../../../../composition/archive-transfer';
import { buildMediaHubBackupExportPlanV6, exportMediaHubBackupV6 } from '../export';
import { inspectMediaHubBackupV6 } from '../inspect';
import { scenarioProjectRootPublisher } from './scenario-project';
import {
  SCENARIO_ASSETS_STORE,
  SCENARIO_PROJECTS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
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
      childIdMap: {},
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
  expect(io.checkpoint.mock.calls[0]?.[2]?.childIds).toEqual({
    'scenario-asset:logical-image': root.assets[0]?.entry.id,
  });
});

it('keeps stable child identities and checkpoints validated children when replacement is skipped', async () => {
  const { args } = input();
  args.session.strategy = 'replace';
  const metadata = args.envelope.metadata as unknown as {
    assets: Array<{ entry: Record<string, unknown> }>;
  };
  let restoredAsset: unknown;
  io.put.mockImplementationOnce(async (input) => {
    restoredAsset = input.root.assets[0]?.entry;
    return { imported: false, conflicted: true };
  });
  io.mutate.mockImplementation(async (operation) =>
    operation({
      get: async () => ({ id: 'guide' }),
      transaction: () => ({
        objectStore: () => ({
          get: async () => restoredAsset ?? metadata.assets[0]?.entry,
          put: vi.fn(),
        }),
        done: Promise.resolve(),
      }),
    })
  );

  const result = await scenarioProjectRootPublisher.publish(args);

  const call = io.put.mock.calls[0]?.[0] as Parameters<
    typeof import('../../../../composition/persistence/scenario/backup-restore').putScenarioProjectBackupRestore
  >[0];
  expect(call.root.entry.id).toBe('guide');
  expect(call.root.assets[0]?.entry.id).toBe('logical-image');
  expect(result).toMatchObject({ conflicted: true, imported: false, retainedAssetIds: [] });
  expect(io.checkpoint.mock.calls[0]?.[2]?.childIds).toEqual({
    'scenario-asset:logical-image': 'logical-image',
  });
});

it('checkpoints only locally validated scenario children when skipping an existing root', async () => {
  const { args } = input();
  const metadata = args.envelope.metadata as unknown as {
    assets: Array<{ entry: Record<string, unknown> }>;
    entry: Record<string, unknown>;
  };
  io.mutate.mockImplementation(async (operation) =>
    operation({
      transaction: () => ({
        objectStore: (store: string) => ({
          get: async (id: string) => {
            if (store === SCENARIO_PROJECTS_STORE) return metadata.entry;
            if (store === SCENARIO_ASSETS_STORE && id === 'logical-image') {
              return {
                ...metadata.assets[0]!.entry,
                assetId: 'physical-existing',
              };
            }
            return undefined;
          },
          put: vi.fn(),
        }),
        done: Promise.resolve(),
      }),
    })
  );

  await expect(
    scenarioProjectRootPublisher.checkpointSkipIfExisting!({
      envelope: args.envelope,
      session: { ...args.session, strategy: 'skip' },
    })
  ).resolves.toBe(true);
  expect(io.checkpoint).toHaveBeenCalledWith(expect.anything(), 'restore', {
    childIds: { 'scenario-asset:logical-image': 'logical-image' },
    conflicted: true,
    imported: false,
    rootKey: 'scenario-project:guide',
    targetRootId: 'guide',
  });
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
it('roundtrips historical image bytes and editable references through the portable ZIP', async () => {
  const { args, history } = input();
  const imageBytes = new Uint8Array([1, 2, 3, 4]);
  const files = new Map([
    ['image-object', new Blob([imageBytes], { type: 'image/png' })],
    ['history-object', new Blob([JSON.stringify(history)], { type: 'application/json' })],
  ]);
  const objects = args.staged.map(({ objectId, ref }) => ({
    blob: files.get(objectId)!,
    ref: {
      objectId,
      filename: objectId === 'image-object' ? 'old.png' : 'saved-versions.json',
      path: `Scenarios/Old/${objectId === 'image-object' ? 'old.png' : 'saved-versions.json'}`,
      mimeType: ref.mimeType,
      size: ref.size,
    },
  }));
  const descriptor = {
    ...args.envelope.descriptor,
    metadataPath: '_sniptale/metadata/scenario-projects/guide.json',
  };
  const plan = buildMediaHubBackupExportPlanV6({
    archiveId: 'guide-roundtrip',
    exportedAt: '2026-09-12T00:00:00.000Z',
    privacy: { includeSourceMetadata: true, includeTelemetry: true, includeWebSnapshots: true },
    roots: [
      {
        descriptor,
        load: async () => ({ metadata: args.envelope.metadata, objects }),
        summary: {
          draftCount: 0,
          recordingCount: 0,
          sourceMetadataCount: 0,
          telemetryCount: 0,
          thumbnailCount: 0,
          webSnapshotCount: 0,
        },
      },
    ],
  });
  const output = createArchiveMemorySink();
  await exportMediaHubBackupV6({ plan, sink: output.sink });
  expect((await inspectMediaHubBackupV6(output.blob())).rootKeys).toEqual([
    'scenario-project:guide',
  ]);
  const reader = await openArchiveReader(output.blob());
  try {
    const envelope = parseRootEnvelope(
      JSON.parse(await reader.entry(descriptor.metadataPath)!.text(1024 * 1024))
    );
    const restoredFiles = new Map<string, File>();
    for (const object of envelope.objects) {
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      await reader.entry(object.path)!.pipeTo(
        new WritableStream<Uint8Array>({
          write: (chunk) => {
            chunks.push(new Uint8Array(chunk));
          },
        })
      );
      restoredFiles.set(
        object.objectId,
        new File(chunks, object.filename, { type: object.mimeType })
      );
    }
    expect(new Uint8Array(await restoredFiles.get('image-object')!.arrayBuffer())).toEqual(
      imageBytes
    );
    io.read.mockImplementation(async (ref: AssetRef) =>
      restoredFiles.get(ref.assetId === 'physical-history' ? 'history-object' : 'image-object')
    );
    await scenarioProjectRootPublisher.publish({ ...args, envelope });
    const call = io.put.mock.calls[0]?.[0] as Parameters<
      typeof import('../../../../composition/persistence/scenario/backup-restore').putScenarioProjectBackupRestore
    >[0];
    const root = call.root;
    expect(root.entry.id).not.toBe('guide');
    expect(root.entry.project.items).toEqual([]);
    const oldStep = root.entry.history?.[0]?.project.items[0];
    if (oldStep?.kind !== 'step') throw new Error('Missing historical step');
    expect(oldStep.blocks[0]).toMatchObject({
      assetId: root.assets[0]?.entry.id,
      editDocumentId: root.stepDocuments[0]?.entry.stepId,
    });
    expect(root.stepDocuments).toHaveLength(1);
  } finally {
    await reader.close();
  }
});

it('rejects oversized narration before publishing an aggregate', async () => {
  const { args } = input();
  const metadata = args.envelope.metadata as unknown as {
    assets: Array<{ entry: Record<string, unknown> }>;
  };
  Object.assign(metadata.assets[0]!.entry, {
    mimeType: 'audio/webm',
    width: 0,
    height: 0,
    duration: 10,
  });
  const object = args.staged.find((item) => item.objectId === 'image-object')!;
  object.ref.mimeType = 'audio/webm';
  object.ref.size = 257 * 1024 * 1024;
  await expect(scenarioProjectRootPublisher.publish(args)).rejects.toThrow('asset metadata');
  expect(io.put).not.toHaveBeenCalled();
  expect(io.checkpoint).not.toHaveBeenCalled();
});
