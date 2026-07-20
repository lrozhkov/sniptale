import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const { buildScenarioPayloadResponseMock } = vi.hoisted(() => ({
  buildScenarioPayloadResponseMock: vi.fn(),
}));

vi.mock('../../router/action-helpers', () => ({
  buildScenarioPayloadResponse: buildScenarioPayloadResponseMock,
}));

import { createScenarioSessionServiceStub } from '../../../../../../../tooling/test/support/scenario-session-service.stub';
import { handleScenarioSessionQuery } from './query';

beforeEach(() => {
  vi.clearAllMocks();
  buildScenarioPayloadResponseMock.mockResolvedValue({ success: true });
});

it('returns the shared payload for session queries', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();

  await handleScenarioSessionQuery({
    resolvedTabId: 12,
    scenarioSessionService,
    message: { type: MessageType.SCENARIO_GET_SESSION },
  });

  expect(buildScenarioPayloadResponseMock).toHaveBeenCalledWith({
    resolvedTabId: 12,
    scenarioSessionService,
    message: { type: MessageType.SCENARIO_GET_SESSION },
  });
});
