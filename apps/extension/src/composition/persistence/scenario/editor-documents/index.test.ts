import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../../features/editor/document/constants';

const { dbGetAllFromIndexMock, dbGetMock, initDBMock, loggerWarnMock } = vi.hoisted(() => ({
  dbGetAllFromIndexMock: vi.fn(),
  dbGetMock: vi.fn(),
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
    get: dbGetMock,
    getAllFromIndex: dbGetAllFromIndexMock,
  });
});

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
  const { getScenarioStepEditorDocument, listScenarioStepEditorDocuments } =
    await import('./index');

  await expect(getScenarioStepEditorDocument('step-1')).resolves.toEqual(entry);
  await expect(listScenarioStepEditorDocuments('project-1')).resolves.toEqual([entry]);
}

async function verifiesInvalidEntryRecovery() {
  dbGetMock.mockResolvedValueOnce({ broken: true });
  dbGetAllFromIndexMock
    .mockResolvedValueOnce({ broken: true })
    .mockResolvedValueOnce([{ broken: true }]);
  const { getScenarioStepEditorDocument, listScenarioStepEditorDocuments } =
    await import('./index');
  await expect(getScenarioStepEditorDocument('step-1')).resolves.toBeUndefined();
  await expect(listScenarioStepEditorDocuments('project-1')).resolves.toEqual([]);
  await expect(listScenarioStepEditorDocuments('project-1')).resolves.toEqual([]);
  expect(loggerWarnMock).toHaveBeenCalledTimes(3);
}

describe('scenario step editor documents db', () => {
  it('gets and lists valid step document entries', verifiesValidEntryReadLifecycle);
  it(
    'warns and recovers when IndexedDB returns invalid stored values',
    verifiesInvalidEntryRecovery
  );
});
