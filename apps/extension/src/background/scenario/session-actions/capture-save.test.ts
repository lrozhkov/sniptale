import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ScenarioSaveCaptureStepMessage } from '../../../contracts/messaging/scenario/types';

const {
  buildScenarioPayloadResponseMock,
  ensureScenarioCaptureProjectMock,
  saveCaptureStepToScenarioProjectMock,
  setScenarioProjectSelectionMock,
} = vi.hoisted(() => ({
  buildScenarioPayloadResponseMock: vi.fn(),
  ensureScenarioCaptureProjectMock: vi.fn(),
  saveCaptureStepToScenarioProjectMock: vi.fn(),
  setScenarioProjectSelectionMock: vi.fn(),
}));

vi.mock('../router/action-helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../router/action-helpers')>()),
  buildScenarioPayloadResponse: buildScenarioPayloadResponseMock,
  saveCaptureStepToScenarioProject: saveCaptureStepToScenarioProjectMock,
  setScenarioProjectSelection: setScenarioProjectSelectionMock,
}));

vi.mock('../router/project-selection', () => ({
  ensureScenarioCaptureProject: ensureScenarioCaptureProjectMock,
}));

import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';
import { handleScenarioSaveCaptureStep } from './capture-save';

function createSaveCaptureMessage(dataUrl: string): ScenarioSaveCaptureStepMessage {
  return {
    type: MessageType.SCENARIO_SAVE_CAPTURE_STEP,
    dataUrl,
    filename: 'capture.png',
    captureSurface: 'visible',
    sourceKind: 'manual',
    page: {
      title: 'Page',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 1000, height: 800 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
  };
}

function createUnlinkedSession() {
  return {
    enabled: true,
    captureMode: 'manual' as const,
    projectId: null,
    projectName: null,
    rememberProjectSelection: false,
    pendingProjectSelection: false,
    sidebarVisible: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  buildScenarioPayloadResponseMock.mockResolvedValue({ success: true });
  ensureScenarioCaptureProjectMock.mockResolvedValue({
    id: 'project-auto',
    name: 'Auto project',
  });
  saveCaptureStepToScenarioProjectMock.mockResolvedValue({
    project: { id: 'project-1', name: 'Project 1' },
    slide: { id: 'slide-1' },
  });
});

it('auto-creates a project and saves the first capture when no project is active', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  vi.mocked(scenarioSessionService.getSession).mockResolvedValue(createUnlinkedSession());

  const response = await handleScenarioSaveCaptureStep({
    resolvedTabId: 9,
    scenarioSessionService,
    message: createSaveCaptureMessage('data:image/png;base64,1'),
  });

  expect(ensureScenarioCaptureProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({ tabId: 9 })
  );
  expect(saveCaptureStepToScenarioProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({ dataUrl: 'data:image/png;base64,1' }),
    'project-auto'
  );
  expect(scenarioSessionService.bumpProjectRevision).toHaveBeenCalledWith(9);
  expect(setScenarioProjectSelectionMock).toHaveBeenCalledWith(
    expect.objectContaining({
      resolvedTabId: 9,
      scenarioSessionService,
      projectSelection: { id: 'project-1', name: 'Project 1' },
      rememberProjectSelection: true,
    })
  );
  expect(response).toEqual(
    expect.objectContaining({
      success: true,
      projectId: 'project-1',
      stepId: 'slide-1',
    })
  );
});

it('returns the shared payload when no project can be resolved', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  vi.mocked(scenarioSessionService.getSession).mockResolvedValue(createUnlinkedSession());
  ensureScenarioCaptureProjectMock.mockResolvedValue({ id: null, name: null });

  const response = await handleScenarioSaveCaptureStep({
    resolvedTabId: 9,
    scenarioSessionService,
    message: createSaveCaptureMessage('data:image/png;base64,2'),
  });

  expect(response).toEqual({ success: true });
  expect(buildScenarioPayloadResponseMock).toHaveBeenCalledTimes(1);
});
