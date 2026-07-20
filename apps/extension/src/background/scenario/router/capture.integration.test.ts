import { beforeEach, expect, it, vi } from 'vitest';

const {
  ensureScenarioCaptureProjectMock,
  recordScenarioSuggestedEventMock,
  saveScenarioCaptureSlideToProjectMock,
  openScenarioEditorMock,
  buildScenarioSessionPayloadMock,
  flushPendingCaptureIfNeededMock,
  getErrorMessageMock,
  resolveProjectSelectionMock,
  translateMock,
} = vi.hoisted(() => ({
  ensureScenarioCaptureProjectMock: vi.fn(async () => ({
    id: 'project-auto',
    name: 'Auto project',
  })),
  recordScenarioSuggestedEventMock: vi.fn(),
  saveScenarioCaptureSlideToProjectMock: vi.fn(),
  openScenarioEditorMock: vi.fn(),
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

vi.mock('../../../composition/persistence/scenario/store/suggested-events', () => ({
  recordScenarioSuggestedEvent: recordScenarioSuggestedEventMock,
}));

vi.mock('../../../composition/persistence/scenario/store/v3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/scenario/store/v3')>()),
  saveScenarioCaptureSlideToProject: saveScenarioCaptureSlideToProjectMock,
}));

vi.mock('../editor', () => ({
  openScenarioEditor: openScenarioEditorMock,
}));

vi.mock('./helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./helpers')>();
  return {
    ...actual,
    buildScenarioSessionPayload: buildScenarioSessionPayloadMock,
    flushPendingCaptureIfNeeded: flushPendingCaptureIfNeededMock,
    resolveProjectSelection: resolveProjectSelectionMock,
  };
});

vi.mock('./project-selection', () => ({
  ensureScenarioCaptureProject: ensureScenarioCaptureProjectMock,
}));

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { routeScenarioMessage } from './route';
import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function createBaseSession() {
  return {
    enabled: true,
    captureMode: 'manual' as const,
    projectId: 'project-1',
    projectName: 'Project 1',
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: true,
  };
}

function createScenarioPayloadResponse() {
  return {
    session: createBaseSession(),
    projects: [{ id: 'project-1', name: 'Project 1', createdAt: 1, updatedAt: 2 }],
  };
}

function createSaveCaptureMessage(overrides: Record<string, unknown> = {}) {
  return {
    type: MessageType.SCENARIO_SAVE_CAPTURE_STEP,
    dataUrl: 'data:image/png;base64,1',
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
    ...overrides,
  };
}

async function routeMessage(
  message: Record<string, unknown>,
  scenarioSessionService: ReturnType<typeof createScenarioSessionServiceStub>
) {
  const sendResponse = vi.fn();
  const handled = routeScenarioMessage({
    message: message as never,
    resolvedTabId: 9,
    sendResponse,
    scenarioSessionService,
  });
  await flushPromises();
  return { handled, sendResponse };
}

beforeEach(() => {
  vi.clearAllMocks();
  buildScenarioSessionPayloadMock.mockResolvedValue(createScenarioPayloadResponse());
  flushPendingCaptureIfNeededMock.mockResolvedValue({});
  saveScenarioCaptureSlideToProjectMock.mockResolvedValue({
    project: { id: 'project-1', name: 'Project 1' },
    slide: { id: 'slide-1' },
  });
});

it('auto-creates a project and saves the first capture when the session has no active project', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  vi.mocked(scenarioSessionService.getSession).mockResolvedValue({
    enabled: true,
    captureMode: 'manual',
    projectId: null,
    projectName: null,
    rememberProjectSelection: false,
    pendingProjectSelection: false,
    sidebarVisible: true,
  });

  const { sendResponse } = await routeMessage(createSaveCaptureMessage(), scenarioSessionService);

  expect(ensureScenarioCaptureProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      tabId: 9,
    })
  );
  expect(saveScenarioCaptureSlideToProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: 'project-auto',
    })
  );
  expect(sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({
      success: true,
      projectId: 'project-1',
      stepId: 'slide-1',
    })
  );
});

it('persists capture steps and suggested events for active projects', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  vi.mocked(scenarioSessionService.getSession)
    .mockResolvedValueOnce(createBaseSession())
    .mockResolvedValueOnce(createBaseSession());
  vi.mocked(scenarioSessionService.setActiveProject).mockResolvedValue(createBaseSession());

  const saveCapture = await routeMessage(
    createSaveCaptureMessage({
      dataUrl: 'data:image/png;base64,save',
      title: 'Step 1',
    }),
    scenarioSessionService
  );
  const recordSuggestedEvent = await routeMessage(
    {
      type: MessageType.SCENARIO_RECORD_SUGGESTED_EVENT,
      kind: 'keydown',
      message: 'Ctrl+S',
      data: { ctrl: true },
    },
    scenarioSessionService
  );

  expect(saveScenarioCaptureSlideToProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: 'project-1',
      title: 'Step 1',
    })
  );
  expect(recordScenarioSuggestedEventMock).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: 'project-1',
      kind: 'keydown',
    })
  );
  expect(saveCapture.sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({ success: true, stepId: 'slide-1' })
  );
  expect(recordSuggestedEvent.sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({ success: true })
  );
});

it('skips suggested-event persistence and opens the editor using the active session project', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  vi.mocked(scenarioSessionService.getSession)
    .mockResolvedValueOnce({
      enabled: true,
      captureMode: 'manual',
      projectId: null,
      projectName: null,
      rememberProjectSelection: false,
      pendingProjectSelection: false,
      sidebarVisible: true,
    })
    .mockResolvedValueOnce(createBaseSession());

  const recordSuggestedEvent = await routeMessage(
    {
      type: MessageType.SCENARIO_RECORD_SUGGESTED_EVENT,
      kind: 'scroll',
      message: 'Scrolled',
    },
    scenarioSessionService
  );
  const openEditor = await routeMessage(
    {
      type: MessageType.SCENARIO_OPEN_EDITOR,
      projectId: null,
    },
    scenarioSessionService
  );

  expect(recordScenarioSuggestedEventMock).not.toHaveBeenCalled();
  expect(openScenarioEditorMock).toHaveBeenCalledWith('project-1', null);
  expect(recordSuggestedEvent.sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({ success: true })
  );
  expect(openEditor.sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

it('serializes router errors through getErrorMessage', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  resolveProjectSelectionMock.mockRejectedValue(new Error('broken selection'));

  const { sendResponse } = await routeMessage(
    {
      type: MessageType.SCENARIO_SET_ACTIVE_PROJECT,
      projectId: 'broken',
      rememberProjectSelection: false,
    },
    scenarioSessionService
  );

  expect(getErrorMessageMock).toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'broken selection',
  });
});
