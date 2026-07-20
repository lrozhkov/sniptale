import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const { buildScenarioPayloadResponseMock } = vi.hoisted(() => ({
  buildScenarioPayloadResponseMock: vi.fn(),
}));

vi.mock('../router/action-helpers', () => ({
  buildScenarioPayloadResponse: buildScenarioPayloadResponseMock,
}));

import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';
import { handleScenarioSessionQuery, handleScenarioSetEnabled } from './queries';

beforeEach(() => {
  vi.clearAllMocks();
  buildScenarioPayloadResponseMock.mockResolvedValue({ success: true });
});

it('re-exports the session-action handlers through the facade', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();

  await handleScenarioSessionQuery({
    resolvedTabId: 12,
    scenarioSessionService,
    message: { type: MessageType.SCENARIO_GET_SESSION },
  });
  await handleScenarioSetEnabled({
    resolvedTabId: 11,
    scenarioSessionService,
    message: { type: MessageType.SCENARIO_SET_ENABLED, enabled: true },
  });

  expect(buildScenarioPayloadResponseMock).toHaveBeenCalledWith({
    resolvedTabId: 12,
    scenarioSessionService,
    message: { type: MessageType.SCENARIO_GET_SESSION },
  });
  expect(scenarioSessionService.setEnabled).toHaveBeenCalledWith(11, true);
  expect(buildScenarioPayloadResponseMock).toHaveBeenCalledTimes(2);
});
