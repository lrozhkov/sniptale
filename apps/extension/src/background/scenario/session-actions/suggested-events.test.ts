import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const { buildScenarioPayloadResponseMock, recordScenarioSuggestedEventMock } = vi.hoisted(() => ({
  buildScenarioPayloadResponseMock: vi.fn(),
  recordScenarioSuggestedEventMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/scenario/store/suggested-events', () => ({
  recordScenarioSuggestedEvent: recordScenarioSuggestedEventMock,
}));

vi.mock('../router/action-helpers', () => ({
  buildScenarioPayloadResponse: buildScenarioPayloadResponseMock,
}));

import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';
import { handleScenarioRecordSuggestedEvent } from './suggested-events';

beforeEach(() => {
  vi.clearAllMocks();
  buildScenarioPayloadResponseMock.mockResolvedValue({ success: true });
});

it('skips suggested-event persistence when no project is active', async () => {
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

  const response = await handleScenarioRecordSuggestedEvent({
    resolvedTabId: 9,
    scenarioSessionService,
    message: {
      type: MessageType.SCENARIO_RECORD_SUGGESTED_EVENT,
      kind: 'scroll',
      message: 'Scrolled',
      data: { deltaY: 120 },
    },
  });

  expect(recordScenarioSuggestedEventMock).not.toHaveBeenCalled();
  expect(response).toEqual({ success: true });
});

it('records suggested events and bumps the project revision for active projects', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  vi.mocked(scenarioSessionService.getSession).mockResolvedValue({
    enabled: true,
    captureMode: 'manual',
    projectId: 'project-1',
    projectName: 'Project 1',
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: true,
  });

  await handleScenarioRecordSuggestedEvent({
    resolvedTabId: 9,
    scenarioSessionService,
    message: {
      type: MessageType.SCENARIO_RECORD_SUGGESTED_EVENT,
      kind: 'keydown',
      message: 'Ctrl+S',
      data: { ctrl: true },
      target: {
        selector: 'input',
        iframeSelector: null,
        tagName: 'input',
        role: 'textbox',
        text: null,
        ariaLabel: null,
        title: null,
        rect: null,
        framePadding: null,
      },
      sourceStepId: 'step-1',
    },
  });

  expect(recordScenarioSuggestedEventMock).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: 'project-1',
      kind: 'keydown',
      message: 'Ctrl+S',
      target: expect.objectContaining({
        selector: 'input',
        tagName: 'input',
      }),
      sourceStepId: 'step-1',
    })
  );
  expect(scenarioSessionService.bumpProjectRevision).toHaveBeenCalledWith(9);
});

it('omits the optional data payload when the message has no structured event metadata', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  vi.mocked(scenarioSessionService.getSession).mockResolvedValue({
    enabled: true,
    captureMode: 'manual',
    projectId: 'project-2',
    projectName: 'Project 2',
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: true,
  });

  await handleScenarioRecordSuggestedEvent({
    resolvedTabId: 10,
    scenarioSessionService,
    message: {
      type: MessageType.SCENARIO_RECORD_SUGGESTED_EVENT,
      kind: 'scroll',
      message: 'Scrolled',
    },
  });

  expect(recordScenarioSuggestedEventMock).toHaveBeenCalledWith({
    projectId: 'project-2',
    kind: 'scroll',
    message: 'Scrolled',
    target: null,
    sourceStepId: null,
  });
});
