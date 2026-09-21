import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  beginRoot: vi.fn(),
  completeSession: vi.fn(),
  createJournal: vi.fn(),
  publishJournal: vi.fn(),
  readSession: vi.fn(),
  restoreGalleryViews: vi.fn(),
  stage: vi.fn(),
  verify: vi.fn(),
}));

vi.mock('../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/assets')>()),
  beginArchiveRestoreRoot: mocks.beginRoot,
  completeArchiveRestoreSession: mocks.completeSession,
  createAssetPublicationJournal: mocks.createJournal,
  publishReadyJournalWithRetry: mocks.publishJournal,
  readArchiveRestoreSession: mocks.readSession,
}));
vi.mock('./restore-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./restore-session')>()),
  verifyMediaHubRestoreResume: mocks.verify,
}));
vi.mock('./staging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./staging')>()),
  stageArchiveRootObjects: mocks.stage,
}));
vi.mock('../../../composition/persistence/gallery-saved-views', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/gallery-saved-views')
  >()),
  restoreGallerySavedViews: mocks.restoreGalleryViews,
}));

import { createArchiveWriter } from '../../../composition/archive-transfer';
import { createArchiveMemorySink } from '../../../composition/archive-transfer/test-support';
import type { ArchiveRestoreSession } from '../../../composition/persistence/assets';
import { restoreMediaHubBackupV6 } from './restore';

let currentSession: ArchiveRestoreSession;

async function reverseDependencyArchive(): Promise<Blob> {
  const descriptors = [
    {
      metadataPath: '_sniptale/metadata/video-projects/video.json',
      objectCount: 0,
      rootId: 'video',
      rootKind: 'video-project' as const,
      totalBytes: 0,
    },
    {
      metadataPath: '_sniptale/metadata/scenario-projects/scenario.json',
      objectCount: 0,
      rootId: 'scenario',
      rootKind: 'scenario-project' as const,
      totalBytes: 0,
    },
  ];
  const paths = [
    '_sniptale/catalog/video-projects-000001.ndjson',
    '_sniptale/catalog/scenario-projects-000001.ndjson',
  ];
  const output = createArchiveMemorySink();
  const writer = createArchiveWriter(output.sink);
  await writer.addText('_sniptale/manifest.json', '{}');
  for (const [index, descriptor] of descriptors.entries()) {
    const metadata =
      descriptor.rootKind === 'video-project'
        ? { entry: { id: descriptor.rootId, project: {} }, projectAssets: [], projectExports: [] }
        : {
            assets: [],
            entry: { id: descriptor.rootId, project: {} },
            exportThumbnails: [],
            exports: [],
            stepDocuments: [],
          };
    await writer.addText(paths[index]!, `${JSON.stringify(descriptor)}\n`);
    await writer.addText(
      descriptor.metadataPath,
      JSON.stringify({ descriptor, metadata, objects: [] })
    );
  }
  await writer.close();
  return output.blob();
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSession = {
    archiveFingerprint: 'a'.repeat(64),
    childIdMap: {},
    committedRoots: [],
    conflictedRoots: [],
    createdAt: 1,
    currentRoot: null,
    kind: 'archive-restore-session',
    operationId: 'restore-1',
    rootIdMap: {},
    skippedRoots: [],
    status: 'pending',
    strategy: 'duplicate',
    updatedAt: 1,
  };
  mocks.verify.mockResolvedValue({
    inspection: {
      manifest: {
        catalogs: [
          { path: '_sniptale/catalog/video-projects-000001.ndjson', rootKind: 'video-project' },
          {
            path: '_sniptale/catalog/scenario-projects-000001.ndjson',
            rootKind: 'scenario-project',
          },
        ],
      },
    },
    session: currentSession,
  });
  mocks.beginRoot.mockImplementation(async (_operationId, root) => {
    currentSession = { ...currentSession, currentRoot: root };
    return currentSession;
  });
  mocks.stage.mockResolvedValue([]);
  mocks.createJournal.mockResolvedValue({ assetRefs: [], journalId: 'journal' });
  mocks.publishJournal.mockImplementation(async (journal, publish) => publish(journal));
  mocks.readSession.mockImplementation(async () => currentSession);
  mocks.completeSession.mockImplementation(async () => {
    currentSession = { ...currentSession, status: 'completed' };
    return currentSession;
  });
  mocks.restoreGalleryViews.mockResolvedValue([]);
});

it('restores scenario owners before dependent videos even for older reversed catalogs', async () => {
  const publicationOrder: string[] = [];
  const scenarioPublisher = {
    profile: 'scenario-project',
    async publish() {
      publicationOrder.push('scenario-project');
      currentSession = {
        ...currentSession,
        childIdMap: { 'scenario-asset:image': 'restored-image' },
        committedRoots: ['scenario-project:scenario'],
        currentRoot: null,
        rootIdMap: { 'scenario-project:scenario': 'restored-scenario' },
      };
      return { conflicted: false, imported: true, retainedAssetIds: [] };
    },
  };
  const videoPublisher = {
    profile: 'video-project',
    async publish() {
      expect(currentSession.childIdMap).toEqual({
        'scenario-asset:image': 'restored-image',
      });
      publicationOrder.push('video-project');
      currentSession = {
        ...currentSession,
        committedRoots: [...currentSession.committedRoots, 'video-project:video'],
        currentRoot: null,
        rootIdMap: { ...currentSession.rootIdMap, 'video-project:video': 'restored-video' },
      };
      return { conflicted: false, imported: true, retainedAssetIds: [] };
    },
  };

  await restoreMediaHubBackupV6({
    file: await reverseDependencyArchive(),
    operationId: 'restore-1',
    publishers: [videoPublisher, scenarioPublisher],
  });

  expect(publicationOrder).toEqual(['scenario-project', 'video-project']);
});
