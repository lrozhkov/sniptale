import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../../../features/editor/document/constants';

const { getScenarioStepEditorDocumentMock, listScenarioStepEditorDocumentsMock } = vi.hoisted(
  () => ({
    getScenarioStepEditorDocumentMock: vi.fn(),
    listScenarioStepEditorDocumentsMock: vi.fn(),
  })
);

vi.mock('../../editor-documents/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../editor-documents/index')>()),
  getScenarioStepEditorDocument: getScenarioStepEditorDocumentMock,
  listScenarioStepEditorDocuments: listScenarioStepEditorDocumentsMock,
}));

import {
  getScenarioStepEditorDocumentRecord,
  listScenarioStepEditorDocumentRecords,
  prepareScenarioStepEditorDocumentRecord,
} from './index';

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
});

async function verifiesFacadeReadLifecycle() {
  const entry = {
    createdAt: 10,
    document: createEditorDocument(),
    projectId: 'project-1',
    stepId: 'step-1',
    updatedAt: 20,
  };
  getScenarioStepEditorDocumentMock.mockResolvedValue(entry);
  listScenarioStepEditorDocumentsMock.mockResolvedValue([entry]);
  await expect(getScenarioStepEditorDocumentRecord('step-1')).resolves.toEqual(entry);
  await expect(listScenarioStepEditorDocumentRecords('project-1')).resolves.toEqual([entry]);
}

describe('step editor document store facade', () => {
  it('prepares a revision-timestamped aggregate child entry', () => {
    vi.spyOn(Date, 'now').mockReturnValue(55);
    expect(
      prepareScenarioStepEditorDocumentRecord({
        document: createEditorDocument(),
        projectId: 'project-1',
        stepId: 'step-1',
      })
    ).toEqual(
      expect.objectContaining({
        createdAt: 55,
        projectId: 'project-1',
        stepId: 'step-1',
        updatedAt: 55,
      })
    );
  });
  it('proxies record reads to the shared db seam', verifiesFacadeReadLifecycle);
});
