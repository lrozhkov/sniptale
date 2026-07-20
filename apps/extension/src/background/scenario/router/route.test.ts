import { beforeEach, expect, it, vi } from 'vitest';

const { handleScenarioSessionQueryMock, handleScenarioDeleteStepMock } = vi.hoisted(() => ({
  handleScenarioSessionQueryMock: vi.fn(),
  handleScenarioDeleteStepMock: vi.fn(),
}));

vi.mock('../session-actions', () => ({
  handleScenarioCreateProject: vi.fn(),
  handleScenarioRecordSuggestedEvent: vi.fn(),
  handleScenarioSaveCaptureStep: vi.fn(),
  handleScenarioSessionQuery: handleScenarioSessionQueryMock,
  handleScenarioSetActiveProject: vi.fn(),
  handleScenarioSetCaptureMode: vi.fn(),
  handleScenarioSetEnabled: vi.fn(),
  handleScenarioSetSidebarVisible: vi.fn(),
  handleScenarioUpdateSessionPrefs: vi.fn(),
  handleScenarioUpdateSurfaceState: vi.fn(),
}));

vi.mock('./step-actions', () => ({
  handleScenarioDeleteStep: handleScenarioDeleteStepMock,
  handleScenarioMoveStep: vi.fn(),
  handleScenarioOpenEditor: vi.fn(),
  handleScenarioRestoreStep: vi.fn(),
}));

import { routeScenarioMessage } from './route';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createScenarioSessionServiceStub } from './test-support';

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  handleScenarioSessionQueryMock.mockResolvedValue({ success: true, session: { enabled: true } });
  handleScenarioDeleteStepMock.mockResolvedValue({ success: true });
});

it('routes session queries through the session-action seam', async () => {
  const sendResponse = vi.fn();
  const handled = routeScenarioMessage({
    message: { type: MessageType.SCENARIO_GET_SESSION } as never,
    resolvedTabId: 4,
    sendResponse,
    scenarioSessionService: createScenarioSessionServiceStub(),
  });

  await flushPromises();

  expect(handled).toBe(true);
  expect(handleScenarioSessionQueryMock).toHaveBeenCalledWith(
    expect.objectContaining({ resolvedTabId: 4 })
  );
  expect(sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({ success: true, session: { enabled: true } })
  );
});

it('routes step deletions through the step-action seam', async () => {
  const sendResponse = vi.fn();
  routeScenarioMessage({
    message: {
      type: MessageType.SCENARIO_DELETE_STEP,
      projectId: 'project-1',
      stepId: 'step-1',
    } as never,
    resolvedTabId: 5,
    sendResponse,
    scenarioSessionService: createScenarioSessionServiceStub(),
  });

  await flushPromises();

  expect(handleScenarioDeleteStepMock).toHaveBeenCalledWith(
    expect.objectContaining({ resolvedTabId: 5 })
  );
});
