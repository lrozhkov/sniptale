// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { installContentRuntimeMessagingMock } from '../../../application/runtime-services/services.test-support';

const { sendRuntimeMessageMock } = vi.hoisted(() => ({
  sendRuntimeMessageMock: vi.fn(async () => ({ success: true })),
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

import {
  requestScenarioRestoreSnapshot,
  setScenarioCaptureMode,
  setScenarioEnabled,
  setScenarioRememberSelection,
  setScenarioSidebarVisible,
  updateScenarioSurfaceState,
} from './transport/session';
import {
  createScenarioProject,
  openScenarioEditor,
  setScenarioActiveProject,
} from './transport/projects';
import {
  deleteScenarioStep,
  moveScenarioStep,
  restoreScenarioStep,
  saveScenarioCaptureStep,
} from './transport/steps';
import {
  captureVisibleScenarioInteraction,
  recordScenarioSuggestedEvent,
} from './transport/capture';

const capturePayload = {
  body: 'Body',
  captureSurface: 'visible' as const,
  cursorPoint: null,
  interactionPoint: null,
  page: {
    devicePixelRatio: 1,
    scrollX: 0,
    scrollY: 0,
    title: 'Page',
    url: 'https://example.com',
    viewport: { height: 720, width: 1280, x: 0, y: 0 },
  },
  sourceKind: 'manual' as const,
  target: null,
  title: 'Title',
};

const suggestedEventTarget = {
  selector: 'button',
  iframeSelector: null,
  tagName: 'button',
  role: null,
  text: 'Go',
  ariaLabel: null,
  title: null,
  rect: { x: 1, y: 2, width: 3, height: 4 },
  framePadding: null,
};

const expectedTransportCalls = [
  [{ type: MessageType.SCENARIO_GET_RESTORE_SNAPSHOT }],
  [
    {
      type: MessageType.SCENARIO_UPDATE_SURFACE_STATE,
      surface: {
        captureAction: 'scenario',
        screenshotMode: true,
        toolbarVisible: true,
      },
    },
  ],
  [{ type: MessageType.SCENARIO_SET_ENABLED, enabled: true }],
  [{ type: MessageType.SCENARIO_SET_CAPTURE_MODE, captureMode: 'by-click' }],
  [
    {
      type: MessageType.SCENARIO_UPDATE_SESSION_PREFS,
      rememberProjectSelection: true,
    },
  ],
  [{ type: MessageType.SCENARIO_SET_SIDEBAR_VISIBLE, sidebarVisible: false }],
  [
    {
      type: MessageType.SCENARIO_SET_ACTIVE_PROJECT,
      projectId: 'project-1',
      rememberProjectSelection: false,
    },
  ],
  [
    {
      type: MessageType.SCENARIO_CREATE_PROJECT,
      name: 'Project 1',
      rememberProjectSelection: false,
    },
  ],
  [{ type: MessageType.SCENARIO_DELETE_STEP, projectId: 'project-1', stepId: 'step-1' }],
  [
    {
      type: MessageType.SCENARIO_MOVE_STEP,
      projectId: 'project-1',
      stepId: 'step-1',
      toIndex: 2,
    },
  ],
  [{ type: MessageType.SCENARIO_RESTORE_STEP, projectId: 'project-1', stepId: 'step-1' }],
  [
    {
      type: MessageType.SCENARIO_SAVE_CAPTURE_STEP,
      dataUrl: 'data:image/png;base64,1',
      filename: 'capture.png',
      galleryAssetId: 'gallery-1',
      ...capturePayload,
    },
  ],
  [
    {
      type: CaptureMessageType.CAPTURE_VISIBLE,
      actionType: 'scenario',
      scenarioCapture: capturePayload,
    },
  ],
  [
    {
      type: MessageType.SCENARIO_RECORD_SUGGESTED_EVENT,
      kind: 'input',
      message: 'Input: field',
      target: suggestedEventTarget,
    },
  ],
];

function resetTransportMocks() {
  vi.clearAllMocks();
  installContentRuntimeMessagingMock(sendRuntimeMessageMock);
}

async function runTransportRoutingScenario() {
  await requestScenarioRestoreSnapshot();
  await updateScenarioSurfaceState({
    captureAction: 'scenario',
    screenshotMode: true,
    toolbarVisible: true,
  });
  await setScenarioEnabled(true);
  await setScenarioCaptureMode('by-click');
  await setScenarioRememberSelection(true);
  await setScenarioSidebarVisible(false);
  await setScenarioActiveProject({
    projectId: 'project-1',
    rememberProjectSelection: false,
  });
  await createScenarioProject({
    name: 'Project 1',
    rememberProjectSelection: false,
  });
  await deleteScenarioStep({ projectId: 'project-1', stepId: 'step-1' });
  await moveScenarioStep({ projectId: 'project-1', stepId: 'step-1', toIndex: 2 });
  await restoreScenarioStep({ projectId: 'project-1', stepId: 'step-1' });
  await saveScenarioCaptureStep({
    dataUrl: 'data:image/png;base64,1',
    filename: 'capture.png',
    galleryAssetId: 'gallery-1',
    scenarioCapture: capturePayload,
  });
  await captureVisibleScenarioInteraction(capturePayload);
  await recordScenarioSuggestedEvent({
    kind: 'input',
    message: 'Input: field',
    target: suggestedEventTarget,
  });
}

function expectTransportRoutingCalls() {
  expect(sendRuntimeMessageMock.mock.calls).toEqual(expectedTransportCalls);
}

async function expectOpenEditorTransport() {
  await expect(
    openScenarioEditor({
      projectId: 'project-1',
      stepId: 'step-9',
    })
  ).resolves.toBeUndefined();

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: MessageType.SCENARIO_OPEN_EDITOR,
    projectId: 'project-1',
    stepId: 'step-9',
  });
}

describe('scenario-controller-runtime.transport', () => {
  beforeEach(resetTransportMocks);

  it('routes scenario controller runtime messages through the typed transport owner', async () => {
    await runTransportRoutingScenario();
    expectTransportRoutingCalls();
  });

  it('opens the scenario editor through the same transport owner', expectOpenEditorTransport);
});
