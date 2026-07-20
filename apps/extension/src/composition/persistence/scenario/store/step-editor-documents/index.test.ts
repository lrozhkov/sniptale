import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../../../features/editor/document/constants';

const {
  deleteScenarioStepEditorDocumentMock,
  getScenarioStepEditorDocumentMock,
  listScenarioStepEditorDocumentsMock,
  saveScenarioStepEditorDocumentMock,
} = vi.hoisted(() => ({
  deleteScenarioStepEditorDocumentMock: vi.fn(),
  getScenarioStepEditorDocumentMock: vi.fn(),
  listScenarioStepEditorDocumentsMock: vi.fn(),
  saveScenarioStepEditorDocumentMock: vi.fn(),
}));

vi.mock('../../editor-documents/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../editor-documents/index')>()),
  deleteScenarioStepEditorDocument: deleteScenarioStepEditorDocumentMock,
  getScenarioStepEditorDocument: getScenarioStepEditorDocumentMock,
  listScenarioStepEditorDocuments: listScenarioStepEditorDocumentsMock,
  saveScenarioStepEditorDocument: saveScenarioStepEditorDocumentMock,
}));

import {
  cloneScenarioStepEditorDocumentRecord,
  deleteScenarioStepEditorDocumentRecord,
  getScenarioStepEditorDocumentRecord,
  listScenarioStepEditorDocumentRecords,
  saveScenarioStepEditorDocumentRecord,
} from './index';

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
});

async function verifiesFacadeCrudLifecycle() {
  const entry = {
    createdAt: 10,
    document: createEditorDocument(),
    projectId: 'project-1',
    stepId: 'step-1',
    updatedAt: 20,
  };
  saveScenarioStepEditorDocumentMock.mockResolvedValue(entry);
  getScenarioStepEditorDocumentMock.mockResolvedValue(entry);
  listScenarioStepEditorDocumentsMock.mockResolvedValue([entry]);
  deleteScenarioStepEditorDocumentMock.mockResolvedValue(undefined);

  await expect(
    saveScenarioStepEditorDocumentRecord({
      document: entry.document,
      projectId: 'project-1',
      stepId: 'step-1',
    })
  ).resolves.toEqual(entry);
  await expect(getScenarioStepEditorDocumentRecord('step-1')).resolves.toEqual(entry);
  await expect(listScenarioStepEditorDocumentRecords('project-1')).resolves.toEqual([entry]);

  await deleteScenarioStepEditorDocumentRecord('step-1');
  expect(deleteScenarioStepEditorDocumentMock).toHaveBeenCalledWith('step-1');
}

async function verifiesCloneLifecycle() {
  const sourceDocument = createEditorDocument();
  getScenarioStepEditorDocumentMock
    .mockResolvedValueOnce({
      createdAt: 10,
      document: sourceDocument,
      projectId: 'project-1',
      stepId: 'source-step',
      updatedAt: 20,
    })
    .mockResolvedValueOnce(undefined);
  saveScenarioStepEditorDocumentMock.mockResolvedValue({
    createdAt: 30,
    document: sourceDocument,
    projectId: 'project-2',
    stepId: 'next-step',
    updatedAt: 40,
  });

  const clonedEntry = await cloneScenarioStepEditorDocumentRecord({
    nextProjectId: 'project-2',
    nextStepId: 'next-step',
    sourceStepId: 'source-step',
  });
  const missingClone = await cloneScenarioStepEditorDocumentRecord({
    nextProjectId: 'project-2',
    nextStepId: 'missing-next-step',
    sourceStepId: 'missing-step',
  });

  expect(clonedEntry).toEqual(
    expect.objectContaining({
      projectId: 'project-2',
      stepId: 'next-step',
    })
  );
  expect(saveScenarioStepEditorDocumentMock).toHaveBeenCalledWith({
    document: expect.any(Object),
    projectId: 'project-2',
    stepId: 'next-step',
  });
  expect(saveScenarioStepEditorDocumentMock.mock.calls[0]?.[0].document).not.toBe(sourceDocument);
  expect(missingClone).toBeUndefined();
}

describe('step editor document store facade', () => {
  it('proxies direct record CRUD to the shared db seam', verifiesFacadeCrudLifecycle);
  it(
    'clones an existing document into the new step owner and keeps source absence as a no-op',
    verifiesCloneLifecycle
  );
});
