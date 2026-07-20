import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../../features/editor/document/constants';

const { dbDeleteMock, dbGetAllFromIndexMock, dbGetMock, dbPutMock, initDBMock, loggerWarnMock } =
  vi.hoisted(() => ({
    dbDeleteMock: vi.fn(),
    dbGetAllFromIndexMock: vi.fn(),
    dbGetMock: vi.fn(),
    dbPutMock: vi.fn(),
    initDBMock: vi.fn(),
    loggerWarnMock: vi.fn(),
  }));

vi.mock('../../infrastructure/indexed-db/core', async () => {
  const actual = await vi.importActual<typeof import('../../infrastructure/indexed-db/core')>(
    '../../infrastructure/indexed-db/core'
  );
  return {
    ...actual,
    initDB: initDBMock,
  };
});

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    warn: loggerWarnMock,
  }),
}));

function createEditorDocument() {
  return {
    version: 1 as const,
    sourceImageData: 'data:image/png;base64,doc',
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

beforeEach(() => {
  vi.clearAllMocks();
  initDBMock.mockResolvedValue({
    delete: dbDeleteMock,
    get: dbGetMock,
    getAllFromIndex: dbGetAllFromIndexMock,
    put: dbPutMock,
  });
});

async function verifiesEntrySaveLifecycle() {
  vi.spyOn(Date, 'now').mockReturnValue(200);
  dbGetMock.mockResolvedValueOnce({
    createdAt: 100,
    document: createEditorDocument(),
    projectId: 'project-1',
    stepId: 'step-1',
    updatedAt: 100,
  });
  const { saveScenarioStepEditorDocument } = await import('./index');

  await saveScenarioStepEditorDocument({
    document: createEditorDocument(),
    projectId: 'project-1',
    stepId: 'step-1',
  });

  expect(dbPutMock).toHaveBeenCalledWith('scenario_step_editor_documents', {
    createdAt: 100,
    document: createEditorDocument(),
    projectId: 'project-1',
    stepId: 'step-1',
    updatedAt: 200,
  });
}

async function verifiesValidEntryReadLifecycle() {
  const entry = {
    createdAt: 100,
    document: createEditorDocument(),
    projectId: 'project-1',
    stepId: 'step-1',
    updatedAt: 200,
  };
  dbGetMock.mockResolvedValueOnce(entry);
  dbGetAllFromIndexMock.mockResolvedValueOnce([entry]);
  const {
    deleteScenarioStepEditorDocument,
    getScenarioStepEditorDocument,
    listScenarioStepEditorDocuments,
  } = await import('./index');

  await expect(getScenarioStepEditorDocument('step-1')).resolves.toEqual(entry);
  await expect(listScenarioStepEditorDocuments('project-1')).resolves.toEqual([entry]);

  await deleteScenarioStepEditorDocument('step-1');
  expect(dbDeleteMock).toHaveBeenCalledWith('scenario_step_editor_documents', 'step-1');
}

async function verifiesInvalidEntryRecovery() {
  vi.spyOn(Date, 'now').mockReturnValue(250);
  dbGetMock.mockResolvedValueOnce({ broken: true }).mockResolvedValueOnce({ broken: true });
  dbGetAllFromIndexMock
    .mockResolvedValueOnce({ broken: true })
    .mockResolvedValueOnce([{ broken: true }]);
  const {
    getScenarioStepEditorDocument,
    listScenarioStepEditorDocuments,
    saveScenarioStepEditorDocument,
  } = await import('./index');

  await expect(
    saveScenarioStepEditorDocument({
      document: createEditorDocument(),
      projectId: 'project-1',
      stepId: 'step-1',
    })
  ).resolves.toEqual(
    expect.objectContaining({
      createdAt: 250,
      projectId: 'project-1',
      stepId: 'step-1',
      updatedAt: 250,
    })
  );
  await expect(getScenarioStepEditorDocument('step-1')).resolves.toBeUndefined();
  await expect(listScenarioStepEditorDocuments('project-1')).resolves.toEqual([]);
  await expect(listScenarioStepEditorDocuments('project-1')).resolves.toEqual([]);
  expect(loggerWarnMock).toHaveBeenCalledTimes(4);
}

describe('scenario step editor documents db', () => {
  it('saves entries with preserved createdAt and refreshed updatedAt', verifiesEntrySaveLifecycle);
  it('gets, lists, and deletes valid step document entries', verifiesValidEntryReadLifecycle);
  it(
    'warns and recovers when IndexedDB returns invalid stored values',
    verifiesInvalidEntryRecovery
  );
});
