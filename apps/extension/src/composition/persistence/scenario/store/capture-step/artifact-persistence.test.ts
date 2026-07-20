import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  initDB: initDBMock,
  SCENARIO_ASSETS_STORE: 'scenario_assets',
  SCENARIO_PROJECTS_STORE: 'scenario_projects',
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE: 'scenario_step_editor_documents',
}));

import { persistScenarioCaptureArtifacts } from './artifact-persistence';
import { createScenarioStoreProjectFixture } from '../test.helpers.ts';

function createEditorDocument() {
  return {
    version: 1 as const,
    sourceImageData: 'data:image/png;base64,asset',
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
    id,
    projectId,
    galleryAssetId: null,
    blob: new Blob(['pixel'], { type: 'image/png' }),
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
    transaction: vi.fn(() => ({
      done: Promise.resolve(),
      objectStore: vi.fn(() => ({
        get: txGetMock,
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
  txGetMock.mockResolvedValueOnce(createStoredProjectEntry(project));

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

  expect(txPutMock).toHaveBeenNthCalledWith(1, assetEntry);
  expect(txPutMock).toHaveBeenNthCalledWith(2, {
    id: project.id,
    project: { ...project, updatedAt: 11 },
    createdAt: project.createdAt,
    updatedAt: 11,
  });
  expect(txPutMock).toHaveBeenNthCalledWith(3, {
    stepId: 'step-1',
    projectId: project.id,
    document: stepDocument,
    createdAt: 11,
    updatedAt: 11,
  });
}

async function verifyArtifactPersistenceWithoutDocument() {
  const project = createScenarioStoreProjectFixture();
  txGetMock.mockResolvedValueOnce(createStoredProjectEntry(project));

  await persistScenarioCaptureArtifacts({
    assetEntry: createCaptureAssetEntry('project-1'),
    baseUpdatedAt: project.updatedAt,
    project,
    projectId: 'project-1',
    stepId: 'step-1',
    stepDocument: null,
  });

  expect(txPutMock).toHaveBeenCalledTimes(2);
}

async function verifyStaleArtifactPersistenceRejectsBeforeWrites() {
  const project = createScenarioStoreProjectFixture();
  txGetMock.mockResolvedValueOnce({
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
