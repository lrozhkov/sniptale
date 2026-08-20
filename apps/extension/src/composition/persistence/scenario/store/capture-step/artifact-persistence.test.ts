import { beforeEach, describe, expect, it, vi } from 'vitest';

const { discardPreparedAssetMock } = vi.hoisted(() => ({
  discardPreparedAssetMock: vi.fn(async () => undefined),
}));

vi.mock('../../../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../assets')>()),
  createAssetPublicationJournal: vi.fn(async (args) => ({
    ...args,
    createdAt: 1,
    journalId: 'scenario-journal',
  })),
  discardPreparedAsset: discardPreparedAssetMock,
  publishReadyJournalWithRetry: vi.fn(async (journal, publish) => publish(journal)),
  recoverStandaloneAssetPublications: vi.fn(async () => 0),
  releaseAssetReadyProtection: vi.fn(),
  writeBlobToAsset: vi.fn(async (blob: Blob) => ({
    ref: {
      assetId: 'editor-source',
      createdAt: 1,
      location: { kind: 'opfs', objectKey: 'objects/editor-source' },
      mimeType: blob.type,
      sha256: null,
      size: blob.size,
    },
  })),
}));
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../../../features/editor/document/constants';

const { initDBMock, txGetMock, txPutMock } = vi.hoisted(() => ({
  initDBMock: vi.fn(),
  txGetMock: vi.fn(),
  txPutMock: vi.fn(),
}));

vi.mock('../../../infrastructure/indexed-db/core', () => ({
  ASSET_OPERATIONS_STORE: 'asset_operations',
  ASSET_OWNERS_STORE: 'asset_owners',
  ASSET_REFS_STORE: 'asset_refs',
  initDB: initDBMock,
  SCENARIO_ASSETS_STORE: 'scenario_assets',
  SCENARIO_PROJECTS_STORE: 'scenario_projects',
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE: 'scenario_step_editor_documents',
}));

import { persistScenarioCaptureArtifacts } from './artifact-persistence';
import { createScenarioStoreProjectFixture } from '../test.helpers.ts';

function createEditorDocument() {
  return {
    version: 2 as const,
    sourceImageData: 'data:image/png;base64,YXNzZXQ=',
    sourceName: null,
    sourceWidth: 320,
    sourceHeight: 180,
    canvasWidth: 320,
    canvasHeight: 180,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 320,
    sourceDisplayHeight: 180,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    canvasJson: '{"version":"7.2.0","objects":[]}',
  };
}

function createCaptureAssetEntry(projectId: string, id = 'asset-1') {
  return {
    assetId: `opfs-${id}`,
    assetRef: {
      assetId: `opfs-${id}`,
      createdAt: 123,
      location: { kind: 'opfs' as const, objectKey: `objects/opfs-${id}` },
      mimeType: 'image/png',
      sha256: null,
      size: 5,
    },
    id,
    projectId,
    galleryAssetId: null,
    mimeType: 'image/png',
    width: 1440,
    height: 900,
    createdAt: 123,
    size: 5,
  };
}

function createStoredProjectEntry(project: ReturnType<typeof createScenarioStoreProjectFixture>) {
  return {
    id: project.id,
    project,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function installStoredProjectEntry(project: ReturnType<typeof createScenarioStoreProjectFixture>) {
  let storedEntry = createStoredProjectEntry(project);
  txGetMock.mockImplementation(async () => storedEntry);
  txPutMock.mockImplementation(async (entry) => {
    if (entry?.id === project.id && 'project' in entry) {
      storedEntry = entry;
    }
  });
  return {
    getStoredEntry: () => storedEntry,
  };
}

function persistCaptureProject(args: {
  assetId?: string;
  baseUpdatedAt: number;
  project: ReturnType<typeof createScenarioStoreProjectFixture>;
}) {
  return persistScenarioCaptureArtifacts({
    assetEntry: createCaptureAssetEntry(args.project.id, args.assetId),
    baseUpdatedAt: args.baseUpdatedAt,
    project: args.project,
    projectId: args.project.id,
    stepId: 'step-1',
    stepDocument: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  initDBMock.mockResolvedValue({
    get: txGetMock,
    transaction: vi.fn(() => ({
      done: Promise.resolve(),
      objectStore: vi.fn((storeName: string) => ({
        delete: vi.fn(),
        get: storeName === 'scenario_projects' ? txGetMock : vi.fn(),
        index: vi.fn(() => ({ count: vi.fn(async () => 0) })),
        put: txPutMock,
      })),
    })),
  });
  vi.spyOn(Date, 'now').mockReturnValue(10);
});

async function verifyArtifactPersistenceWithDocument() {
  const project = createScenarioStoreProjectFixture();
  const assetEntry = createCaptureAssetEntry(project.id);
  const stepDocument = createEditorDocument();
  txGetMock.mockResolvedValue(createStoredProjectEntry(project));

  await expect(
    persistScenarioCaptureArtifacts({
      assetEntry,
      baseUpdatedAt: project.updatedAt,
      project,
      projectId: project.id,
      stepId: 'step-1',
      stepDocument,
    })
  ).resolves.toEqual(expect.objectContaining({ updatedAt: 11 }));

  expect(txPutMock).toHaveBeenCalledWith(assetEntry.assetRef);
  expect(txPutMock).toHaveBeenCalledWith({
    assetId: assetEntry.assetId,
    ownerId: assetEntry.id,
    ownerKind: 'scenario-asset',
    role: 'body',
  });
  const { assetRef: _assetRef, ...storedAsset } = assetEntry;
  expect(txPutMock).toHaveBeenCalledWith(storedAsset);
  expect(txPutMock).toHaveBeenCalledWith({
    id: project.id,
    project: { ...project, tags: [], updatedAt: 11 },
    createdAt: project.createdAt,
    lifecycle: {
      savedAt: 10,
      storageClass: 'library',
      updatedAt: 11,
    },
    updatedAt: 11,
    workspaceRevision: 1,
  });
  expect(txPutMock).toHaveBeenCalledWith({
    stepId: 'step-1',
    projectId: project.id,
    document: expect.objectContaining({
      assets: [{ assetId: 'editor-source', role: 'source-image' }],
      sourceImage: { assetId: 'editor-source' },
      version: 3,
    }),
    createdAt: 11,
    updatedAt: 11,
  });
  expect(txPutMock).not.toHaveBeenCalledWith(
    expect.objectContaining({
      document: expect.objectContaining({ sourceImageData: expect.anything() }),
    })
  );
}

async function verifyArtifactPersistenceWithoutDocument() {
  const project = createScenarioStoreProjectFixture();
  txGetMock.mockResolvedValue(createStoredProjectEntry(project));

  await persistScenarioCaptureArtifacts({
    assetEntry: createCaptureAssetEntry('project-1'),
    baseUpdatedAt: project.updatedAt,
    project,
    projectId: 'project-1',
    stepId: 'step-1',
    stepDocument: null,
  });

  expect(txPutMock).toHaveBeenCalledTimes(4);
}

async function verifyStaleArtifactPersistenceRejectsBeforeWrites() {
  const project = createScenarioStoreProjectFixture();
  txGetMock.mockResolvedValue({
    ...createStoredProjectEntry(project),
    project: { ...project, updatedAt: project.updatedAt + 1 },
    updatedAt: project.updatedAt + 1,
  });

  await expect(
    persistScenarioCaptureArtifacts({
      assetEntry: {
        ...createCaptureAssetEntry(project.id),
      },
      baseUpdatedAt: project.updatedAt,
      project,
      projectId: project.id,
      stepId: 'step-1',
      stepDocument: null,
    })
  ).rejects.toThrow(`Scenario project ${project.id} was changed before this save completed`);

  expect(txPutMock).not.toHaveBeenCalled();
}

async function verifySameMillisecondArtifactPersistenceRejectsStaleWrites() {
  const project = createScenarioStoreProjectFixture();
  const store = installStoredProjectEntry(project);

  await persistCaptureProject({ baseUpdatedAt: project.updatedAt, project });

  expect(store.getStoredEntry()).toEqual(
    expect.objectContaining({
      project: expect.objectContaining({ updatedAt: 11 }),
      updatedAt: 11,
    })
  );
  txPutMock.mockClear();

  await expect(
    persistScenarioCaptureArtifacts({
      assetEntry: createCaptureAssetEntry(project.id, 'asset-2'),
      baseUpdatedAt: project.updatedAt,
      project: { ...project, name: 'Stale second write' },
      projectId: project.id,
      stepId: 'step-1',
      stepDocument: null,
    })
  ).rejects.toThrow(`Scenario project ${project.id} was changed before this save completed`);

  expect(txPutMock).not.toHaveBeenCalled();
}

async function verifySameMillisecondArtifactPersistenceReturnsRevisionForFollowUpWrite() {
  const project = createScenarioStoreProjectFixture();
  installStoredProjectEntry(project);

  const persistedProject = await persistCaptureProject({
    baseUpdatedAt: project.updatedAt,
    project,
  });
  const followUpProject = await persistCaptureProject({
    assetId: 'asset-2',
    baseUpdatedAt: persistedProject.updatedAt,
    project: { ...persistedProject, name: 'Follow-up write' },
  });

  expect(persistedProject.updatedAt).toBe(11);
  expect(followUpProject).toEqual(
    expect.objectContaining({ name: 'Follow-up write', updatedAt: 12 })
  );
}

describe('capture-step artifact persistence', () => {
  it(
    'persists project, asset, and editor document records together',
    verifyArtifactPersistenceWithDocument
  );
  it(
    'skips editor document persistence when no overlay document exists',
    verifyArtifactPersistenceWithoutDocument
  );
  it(
    'rejects stale project writes before persisting capture artifacts',
    verifyStaleArtifactPersistenceRejectsBeforeWrites
  );
  it(
    'advances same-millisecond artifact writes before rejecting a stale writer',
    verifySameMillisecondArtifactPersistenceRejectsStaleWrites
  );
  it(
    'returns persisted revisions for immediate follow-up artifact writes',
    verifySameMillisecondArtifactPersistenceReturnsRevisionForFollowUpWrite
  );
});
