import { beforeEach, expect, it, vi } from 'vitest';

const { buildScenarioSessionPayloadMock, getErrorMessageMock } = vi.hoisted(() => ({
  buildScenarioSessionPayloadMock: vi.fn(),
  getErrorMessageMock: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : 'unknown error'
  ),
}));

vi.mock('../../../platform/runtime-messaging/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging/index')>()),
  getErrorMessage: getErrorMessageMock,
}));

vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers')>()),
  buildPendingCapture: vi.fn(),
  buildScenarioSessionPayload: buildScenarioSessionPayloadMock,
  flushPendingCaptureIfNeeded: vi.fn(),
  resolveProjectSelection: vi.fn(),
}));

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { routeScenarioMessage } from './route';
import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';
import {
  createBaseScenarioSession,
  createScenarioPayloadResponse,
  flushScenarioRouterPromises,
} from './test-support';

async function routeMessage(message: Record<string, unknown>) {
  const scenarioSessionService = createScenarioSessionServiceStub();
  const sendResponse = vi.fn();
  routeScenarioMessage({
    message: message as never,
    resolvedTabId: 9,
    sendResponse,
    scenarioSessionService,
  });
  await flushScenarioRouterPromises();
  return { scenarioSessionService, sendResponse };
}

beforeEach(() => {
  vi.clearAllMocks();
  buildScenarioSessionPayloadMock.mockResolvedValue(createScenarioPayloadResponse());
});

it('routes sidebar, surface, and preference updates through the session service', async () => {
  const setSidebarVisible = await routeMessage({
    type: MessageType.SCENARIO_SET_SIDEBAR_VISIBLE,
    sidebarVisible: false,
  });
  const updateSurfaceState = await routeMessage({
    type: MessageType.SCENARIO_UPDATE_SURFACE_STATE,
    surface: { hoverPoint: { x: 10, y: 20 } },
  });
  const updateSessionPrefs = await routeMessage({
    type: MessageType.SCENARIO_UPDATE_SESSION_PREFS,
    rememberProjectSelection: true,
  });

  expect(setSidebarVisible.scenarioSessionService.setSidebarVisible).toHaveBeenCalledWith(9, false);
  expect(updateSurfaceState.scenarioSessionService.updateSurfaceState).toHaveBeenCalledWith(9, {
    hoverPoint: { x: 10, y: 20 },
  });
  expect(
    updateSessionPrefs.scenarioSessionService.setRememberProjectSelection
  ).toHaveBeenCalledWith(9, true);
  expect(setSidebarVisible.sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({ success: true, session: createBaseScenarioSession() })
  );
  expect(updateSurfaceState.sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({ success: true, session: createBaseScenarioSession() })
  );
  expect(updateSessionPrefs.sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({ success: true, session: createBaseScenarioSession() })
  );
});
