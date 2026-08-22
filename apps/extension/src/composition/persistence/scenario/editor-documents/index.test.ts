import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../../features/editor/document/constants';
import { createPersistedEditorDocumentFixture } from '../../document-assets/test-support';

const {
  dbGetAllFromIndexMock,
  dbGetMock,
  hydrateMock,
  initDBMock,
  loggerWarnMock,
  materializeMock,
} = vi.hoisted(() => ({
  dbGetAllFromIndexMock: vi.fn(),
  dbGetMock: vi.fn(),
  initDBMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  hydrateMock: vi.fn(),
  materializeMock: vi.fn(),
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
vi.mock('../../document-assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document-assets')>()),
  hydratePersistedEditorDocument: hydrateMock,
  materializePersistedEditorDocumentForLegacyTransfer: materializeMock,
}));
vi.mock('../../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../assets')>()),
  recoverStandaloneAssetPublications: vi.fn(async () => 0),
}));

function createEditorDocument() {
  return {
    version: 2 as const,
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
  hydrateMock.mockImplementation(async () => ({
    document: createEditorDocument(),
    release: vi.fn(),
  }));
  materializeMock.mockResolvedValue(createEditorDocument());
});

async function verifiesValidEntryReadLifecycle() {
  const entry = {
    createdAt: 100,
    document: createPersistedEditorDocumentFixture(createEditorDocument()),
    projectId: 'project-1',
    stepId: 'step-1',
    updatedAt: 200,
  };
  dbGetMock.mockResolvedValueOnce(entry);
  dbGetAllFromIndexMock.mockResolvedValueOnce([entry]);
  const { getScenarioStepEditorDocument, listScenarioStepEditorDocuments } =
    await import('./index');

  const expected = expect.objectContaining({ ...entry, document: createEditorDocument() });
  await expect(getScenarioStepEditorDocument('step-1')).resolves.toEqual(expected);
  await expect(listScenarioStepEditorDocuments('project-1')).resolves.toEqual([expected]);
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
  it('materializes a file-backed document only at the transfer boundary', async () => {
    const entry = {
      createdAt: 100,
      document: createPersistedEditorDocumentFixture(createEditorDocument()),
      projectId: 'project-1',
      stepId: 'step-1',
      updatedAt: 200,
    };
    const ref = { assetId: 'editor-source' };
    dbGetMock.mockResolvedValueOnce(entry).mockResolvedValueOnce(ref);
    const { getScenarioStepEditorDocumentForTransfer } = await import('./index');

    await expect(getScenarioStepEditorDocumentForTransfer('step-1')).resolves.toEqual({
      ...entry,
      document: createEditorDocument(),
    });
    expect(materializeMock).toHaveBeenCalledWith({ document: entry.document, refs: [ref] });
  });

  it('does not materialize an invalid transfer row', async () => {
    dbGetMock.mockResolvedValueOnce({ broken: true });
    const { getScenarioStepEditorDocumentForTransfer } = await import('./index');
    await expect(getScenarioStepEditorDocumentForTransfer('step-1')).resolves.toBeUndefined();
    expect(materializeMock).not.toHaveBeenCalled();
  });

  it('replays cold-runtime publications before the first document read', async () => {
    const order: string[] = [];
    const assetMocks = await import('../../assets');
    vi.mocked(assetMocks.recoverStandaloneAssetPublications).mockImplementationOnce(async () => {
      order.push('recover');
      return 1;
    });
    dbGetMock.mockImplementationOnce(async () => {
      order.push('read');
      return undefined;
    });
    const { getScenarioStepEditorDocument } = await import('./index');

    await expect(getScenarioStepEditorDocument('step-1')).resolves.toBeUndefined();
    expect(order).toEqual(['recover', 'read']);
  });
});
