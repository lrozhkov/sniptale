import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const { buildScenarioPayloadResponseMock } = vi.hoisted(() => ({
  buildScenarioPayloadResponseMock: vi.fn(),
}));

vi.mock('../../router/action-helpers', () => ({
  buildScenarioPayloadResponse: buildScenarioPayloadResponseMock,
}));

import { createScenarioSessionServiceStub } from '../../../../../../../tooling/test/support/scenario-session-service.stub';
import {
  handleScenarioSetCaptureMode,
  handleScenarioSetEnabled,
  handleScenarioSetSidebarVisible,
  handleScenarioUpdateSessionPrefs,
  handleScenarioUpdateSurfaceState,
} from './mutations';

beforeEach(() => {
  vi.clearAllMocks();
  buildScenarioPayloadResponseMock.mockResolvedValue({ success: true });
});

it('routes simple session mutations through the session service', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();

  await handleScenarioSetEnabled({
    resolvedTabId: 11,
    scenarioSessionService,
    message: { type: MessageType.SCENARIO_SET_ENABLED, enabled: true },
  });
  await handleScenarioSetCaptureMode({
    resolvedTabId: 11,
    scenarioSessionService,
    message: { type: MessageType.SCENARIO_SET_CAPTURE_MODE, captureMode: 'by-click' },
  });
  await handleScenarioSetSidebarVisible({
    resolvedTabId: 11,
    scenarioSessionService,
    message: { type: MessageType.SCENARIO_SET_SIDEBAR_VISIBLE, sidebarVisible: false },
  });
  await handleScenarioUpdateSurfaceState({
    resolvedTabId: 11,
    scenarioSessionService,
    message: {
      type: MessageType.SCENARIO_UPDATE_SURFACE_STATE,
      surface: {
        screenshotMode: true,
        toolbarVisible: false,
        captureAction: 'scenario',
      },
    },
  });
  await handleScenarioUpdateSessionPrefs({
    resolvedTabId: 11,
    scenarioSessionService,
    message: {
      type: MessageType.SCENARIO_UPDATE_SESSION_PREFS,
      rememberProjectSelection: false,
    },
  });

  expect(scenarioSessionService.setEnabled).toHaveBeenCalledWith(11, true);
  expect(scenarioSessionService.setCaptureMode).toHaveBeenCalledWith(11, 'by-click');
  expect(scenarioSessionService.setSidebarVisible).toHaveBeenCalledWith(11, false);
  expect(scenarioSessionService.updateSurfaceState).toHaveBeenCalledWith(11, {
    screenshotMode: true,
    toolbarVisible: false,
    captureAction: 'scenario',
  });
  expect(scenarioSessionService.setRememberProjectSelection).toHaveBeenCalledWith(11, false);
  expect(buildScenarioPayloadResponseMock).toHaveBeenCalledTimes(5);
});
