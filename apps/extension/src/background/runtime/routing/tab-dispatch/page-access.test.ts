import { beforeEach, expect, it } from 'vitest';

import {
  createSendResponse,
  createTopLevelContentSender,
  ensureActivePageAccessRuntimeMock,
  flushPromises,
  isScenarioMessageMock,
  isTabModeMessageMock,
  loggerErrorMock,
  loggerWarnMock,
  registerListener,
  resetRuntimeMessagingMocks,
  routeScenarioMessageMock,
  routeTabModeMessageMock,
} from '../../../../../../../tooling/test/support/background-runtime-messaging.test-support';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { routeAuthorizedTabAction as handleTabMessage } from './adapters/dispatcher';

beforeEach(() => {
  resetRuntimeMessagingMocks();
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
});

it('keeps the viewer port registry when tab-mode deps provide it', async () => {
  const { deps } = registerListener();
  const sendResponse = createSendResponse();
  isTabModeMessageMock.mockReturnValue(true);
  routeTabModeMessageMock.mockReturnValue(true);

  handleTabMessage({
    deps,
    logger: { error: loggerErrorMock, warn: loggerWarnMock },
    message: { type: MessageType.ENABLE_HIGHLIGHTER_MODE },
    resolvedTabId: 17,
    sendResponse,
    sender: createTopLevelContentSender(17, 'https://example.test/page'),
  });
  await flushPromises();

  expect(routeTabModeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      webSnapshotViewerPorts: deps.webSnapshotViewerPorts,
    })
  );
});

it('routes scenario messages after page access is authorized', async () => {
  const { deps } = registerListener();
  const sendResponse = createSendResponse();
  isScenarioMessageMock.mockReturnValue(true);
  routeScenarioMessageMock.mockReturnValue(true);

  handleTabMessage({
    deps,
    logger: { error: loggerErrorMock, warn: loggerWarnMock },
    message: { type: 'SCENARIO_GET_SESSION' },
    resolvedTabId: 17,
    sendResponse,
    sender: createTopLevelContentSender(17, 'https://example.test/page'),
  });
  await flushPromises();

  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(17);
  expect(routeScenarioMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      resolvedTabId: 17,
      scenarioSessionService: deps.scenarioSessionService,
    })
  );
});
