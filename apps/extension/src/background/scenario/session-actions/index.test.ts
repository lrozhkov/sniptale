import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const { buildScenarioPayloadResponseMock } = vi.hoisted(() => ({
  buildScenarioPayloadResponseMock: vi.fn(),
}));

vi.mock('../router/action-helpers', () => ({
  buildScenarioPayloadResponse: buildScenarioPayloadResponseMock,
}));

import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';
import { handleScenarioSessionQuery, handleScenarioSetEnabled } from './index';

beforeEach(() => {
  vi.clearAllMocks();
  buildScenarioPayloadResponseMock.mockResolvedValue({ success: true });
});

it('re-exports the session-action handlers through the owner barrel', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();

  await handleScenarioSessionQuery({
    resolvedTabId: 3,
    scenarioSessionService,
    message: { type: MessageType.SCENARIO_GET_SESSION },
  });
  await handleScenarioSetEnabled({
    resolvedTabId: 3,
    scenarioSessionService,
    message: { type: MessageType.SCENARIO_SET_ENABLED, enabled: true },
  });

  expect(scenarioSessionService.setEnabled).toHaveBeenCalledWith(3, true);
  expect(buildScenarioPayloadResponseMock).toHaveBeenCalledTimes(2);
});
