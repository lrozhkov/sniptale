import { beforeEach, expect, it, vi } from 'vitest';

const {
  createScenarioProjectRecordV3Mock,
  deleteScenarioStepFromProjectMock,
  moveScenarioStepInProjectMock,
  restoreScenarioStepFromProjectMock,
  recordScenarioSuggestedEventMock,
  saveScenarioCaptureStepToProjectMock,
  openScenarioEditorMock,
  buildPendingCaptureMock,
  buildScenarioSessionPayloadMock,
  flushPendingCaptureIfNeededMock,
  getErrorMessageMock,
  resolveProjectSelectionMock,
  translateMock,
} = vi.hoisted(() => ({
  createScenarioProjectRecordV3Mock: vi.fn(),
  deleteScenarioStepFromProjectMock: vi.fn(),
  moveScenarioStepInProjectMock: vi.fn(),
  restoreScenarioStepFromProjectMock: vi.fn(),
  recordScenarioSuggestedEventMock: vi.fn(),
  saveScenarioCaptureStepToProjectMock: vi.fn(),
  openScenarioEditorMock: vi.fn(),
  buildPendingCaptureMock: vi.fn(() => ({ id: 'pending-1' })),
  buildScenarioSessionPayloadMock: vi.fn(),
  flushPendingCaptureIfNeededMock: vi.fn(),
  getErrorMessageMock: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : 'unknown error'
  ),
  resolveProjectSelectionMock: vi.fn(),
  translateMock: vi.fn(() => 'New scenario'),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

vi.mock('../../../platform/runtime-messaging/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging/index')>()),
  getErrorMessage: getErrorMessageMock,
}));

vi.mock('../../../composition/persistence/scenario/store/v3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/scenario/store/v3')>()),
  createScenarioProjectRecordV3: createScenarioProjectRecordV3Mock,
}));

vi.mock(
  '../../../composition/persistence/scenario/store/project-steps/index',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/scenario/store/project-steps/index')
    >()),
    deleteScenarioStepFromProject: deleteScenarioStepFromProjectMock,
    moveScenarioStepInProject: moveScenarioStepInProjectMock,
    restoreScenarioStepFromProject: restoreScenarioStepFromProjectMock,
  })
);

vi.mock('../../../composition/persistence/scenario/store/suggested-events', () => ({
  recordScenarioSuggestedEvent: recordScenarioSuggestedEventMock,
}));

vi.mock('../../../composition/persistence/scenario/store/capture-step', () => ({
  saveScenarioCaptureStepToProject: saveScenarioCaptureStepToProjectMock,
}));

vi.mock('../editor', () => ({
  openScenarioEditor: openScenarioEditorMock,
}));
vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers')>()),
  buildPendingCapture: buildPendingCaptureMock,
  buildScenarioSessionPayload: buildScenarioSessionPayloadMock,
  flushPendingCaptureIfNeeded: flushPendingCaptureIfNeededMock,
  resolveProjectSelection: resolveProjectSelectionMock,
}));
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';
import { createBaseScenarioSession, createScenarioPayloadResponse } from './test-support';
import { routeScenarioTestMessage } from './index.integration.test-support';

beforeEach(() => {
  vi.clearAllMocks();
  buildScenarioSessionPayloadMock.mockResolvedValue(createScenarioPayloadResponse());
  flushPendingCaptureIfNeededMock.mockResolvedValue({});
  createScenarioProjectRecordV3Mock.mockResolvedValue({
    id: 'project-created',
    name: 'Created project',
    updatedAt: 20,
  });
  saveScenarioCaptureStepToProjectMock.mockResolvedValue({
    project: { id: 'project-1', name: 'Project 1', updatedAt: 20 },
    step: { id: 'step-1' },
  });
  deleteScenarioStepFromProjectMock.mockResolvedValue({
    id: 'project-1',
    updatedAt: 40,
  });
  moveScenarioStepInProjectMock.mockResolvedValue({
    id: 'project-1',
    updatedAt: 50,
  });
  restoreScenarioStepFromProjectMock.mockResolvedValue({
    id: 'project-1',
    updatedAt: 60,
  });
});

it('routes session and mode updates through the session service', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  vi.mocked(scenarioSessionService.setEnabled).mockResolvedValue(createBaseScenarioSession());
  vi.mocked(scenarioSessionService.setCaptureMode).mockResolvedValue({
    ...createBaseScenarioSession(),
    captureMode: 'by-click',
  });

  const getSession = await routeScenarioTestMessage(
    { type: MessageType.SCENARIO_GET_SESSION },
    scenarioSessionService
  );
  const setEnabled = await routeScenarioTestMessage(
    { type: MessageType.SCENARIO_SET_ENABLED, enabled: true },
    scenarioSessionService
  );
  const setCaptureMode = await routeScenarioTestMessage(
    { type: MessageType.SCENARIO_SET_CAPTURE_MODE, captureMode: 'by-click' },
    scenarioSessionService
  );

  expect(getSession.handled).toBe(true);
  expect(setEnabled.handled).toBe(true);
  expect(setCaptureMode.handled).toBe(true);
  expect(scenarioSessionService.setEnabled).toHaveBeenCalledWith(9, true);
  expect(scenarioSessionService.setCaptureMode).toHaveBeenCalledWith(9, 'by-click');
  expect(getSession.sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
});

it('sets the active project and flushes the pending capture when a project is selected', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  resolveProjectSelectionMock.mockResolvedValue({
    id: 'project-9',
    name: 'Project 9',
  });
  vi.mocked(scenarioSessionService.setActiveProject).mockResolvedValue({
    ...createBaseScenarioSession(),
    projectId: 'project-9',
    projectName: 'Project 9',
  });
  flushPendingCaptureIfNeededMock.mockResolvedValue({
    stepId: 'step-pending',
  });

  const { sendResponse } = await routeScenarioTestMessage(
    {
      type: MessageType.SCENARIO_SET_ACTIVE_PROJECT,
      projectId: 'project-9',
      rememberProjectSelection: true,
    },
    scenarioSessionService
  );

  expect(resolveProjectSelectionMock).toHaveBeenCalledWith('project-9');
  expect(scenarioSessionService.setActiveProject).toHaveBeenCalledWith(
    9,
    { id: 'project-9', name: 'Project 9' },
    { rememberProjectSelection: true }
  );
  expect(flushPendingCaptureIfNeededMock).toHaveBeenCalledWith(
    9,
    'project-9',
    scenarioSessionService
  );
  expect(sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({
      success: true,
      projectId: 'project-9',
      stepId: 'step-pending',
    })
  );
});

it('creates a new scenario project and falls back to the localized default name', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  vi.mocked(scenarioSessionService.setActiveProject).mockResolvedValue({
    ...createBaseScenarioSession(),
    projectId: 'project-created',
    projectName: 'Created project',
  });

  const { sendResponse } = await routeScenarioTestMessage(
    {
      type: MessageType.SCENARIO_CREATE_PROJECT,
      name: '   ',
      rememberProjectSelection: false,
    },
    scenarioSessionService
  );

  expect(translateMock).toHaveBeenCalledWith('scenario.common.defaultProjectName');
  expect(createScenarioProjectRecordV3Mock).toHaveBeenCalledWith('New scenario');
  expect(sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({
      success: true,
      projectId: 'project-created',
    })
  );
});

it('routes step delete, move, restore, and editor-open messages through shared seams', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  vi.mocked(scenarioSessionService.getSession).mockResolvedValue(createBaseScenarioSession());

  const deleteStep = await routeScenarioTestMessage(
    {
      type: MessageType.SCENARIO_DELETE_STEP,
      projectId: 'project-1',
      stepId: 'step-1',
    },
    scenarioSessionService
  );
  const moveStep = await routeScenarioTestMessage(
    {
      type: MessageType.SCENARIO_MOVE_STEP,
      projectId: 'project-1',
      stepId: 'step-1',
      toIndex: 2,
    },
    scenarioSessionService
  );
  const restoreStep = await routeScenarioTestMessage(
    {
      type: MessageType.SCENARIO_RESTORE_STEP,
      projectId: 'project-1',
      stepId: 'step-1',
    },
    scenarioSessionService
  );
  const openEditor = await routeScenarioTestMessage(
    {
      type: MessageType.SCENARIO_OPEN_EDITOR,
      projectId: 'project-1',
      stepId: 'step-1',
    },
    scenarioSessionService
  );

  expect(deleteScenarioStepFromProjectMock).toHaveBeenCalledWith('project-1', 'step-1');
  expect(moveScenarioStepInProjectMock).toHaveBeenCalledWith('project-1', 'step-1', 2);
  expect(restoreScenarioStepFromProjectMock).toHaveBeenCalledWith('project-1', 'step-1');
  expect(openScenarioEditorMock).toHaveBeenCalledWith('project-1', 'step-1');
  expect(scenarioSessionService.bumpProjectRevision).toHaveBeenNthCalledWith(1, 9);
  expect(scenarioSessionService.bumpProjectRevision).toHaveBeenNthCalledWith(2, 9);
  expect(scenarioSessionService.bumpProjectRevision).toHaveBeenNthCalledWith(3, 9);
  expect(deleteStep.sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  expect(moveStep.sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  expect(restoreStep.sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  expect(openEditor.sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

it('routes step-action failures through the shared error responder', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  vi.mocked(scenarioSessionService.getSession).mockResolvedValue(createBaseScenarioSession());
  deleteScenarioStepFromProjectMock.mockRejectedValue(new Error('boom'));

  const { sendResponse } = await routeScenarioTestMessage(
    {
      type: MessageType.SCENARIO_DELETE_STEP,
      projectId: 'project-1',
      stepId: 'step-1',
    },
    scenarioSessionService
  );

  expect(getErrorMessageMock).toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'boom',
  });
});
