import { beforeEach, expect, it, vi } from 'vitest';

import type { BackgroundOwnedRouteContext } from '../../routing-contracts/owned-route-context';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const routeMocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  resolveAISettingsQueryResponse: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ error: routeMocks.loggerError, warn: routeMocks.loggerWarn }),
}));

vi.mock('./query-service', () => ({
  resolveAISettingsQueryResponse: routeMocks.resolveAISettingsQueryResponse,
}));

import { routeAiSettingsQueryMessage } from './query-route';

function createRouteContext(
  operation = 'read-model-selection-bootstrap'
): BackgroundOwnedRouteContext {
  return {
    authorityFamily: 'ai-settings-query-authority',
    freshnessReplay: 'sync-policy-approved',
    messageBinding: { operation, type: MessageType.AI_SETTINGS_QUERY },
    ownerRoute: {
      handlerId: 'ai-settings-query',
      messageTypes: [MessageType.AI_SETTINGS_QUERY],
      ownerModule: 'apps/extension/src/background/ai/settings/query-route.ts',
      policyStateIds: [],
      routeAuthorityFamily: 'background-owned-ipc',
    },
    preauthorization: { kind: 'background-owned-route-policy' },
    senderClassification: 'content-tab-runtime',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  routeMocks.resolveAISettingsQueryResponse.mockResolvedValue({
    modelSelection: {
      chromeAiEnabled: false,
      defaultModelId: null,
      globalSystemPrompt: '',
      models: [],
      providers: [],
    },
    success: true,
  });
});

it('routes preauthorized AI settings queries through the background service', async () => {
  const sendResponse = vi.fn();
  const message = {
    operation: 'read-model-selection-bootstrap',
    type: MessageType.AI_SETTINGS_QUERY,
  } as const;

  expect(
    routeAiSettingsQueryMessage(
      message,
      { tab: { id: 7 } as chrome.tabs.Tab, url: 'https://page.test' },
      sendResponse,
      createRouteContext()
    )
  ).toBe(true);

  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({
      modelSelection: {
        chromeAiEnabled: false,
        defaultModelId: null,
        globalSystemPrompt: '',
        models: [],
        providers: [],
      },
      success: true,
    })
  );
  expect(routeMocks.resolveAISettingsQueryResponse).toHaveBeenCalledWith(message);
});

it('rejects AI settings queries without matching action-kernel context', () => {
  const sendResponse = vi.fn();

  expect(
    routeAiSettingsQueryMessage(
      {
        operation: 'read-model-selection-bootstrap',
        type: MessageType.AI_SETTINGS_QUERY,
      },
      { tab: { id: 7 } as chrome.tabs.Tab },
      sendResponse,
      null
    )
  ).toBe(true);

  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized AI settings query sender',
    success: false,
  });
  expect(routeMocks.resolveAISettingsQueryResponse).not.toHaveBeenCalled();
  expect(routeMocks.loggerWarn).toHaveBeenCalled();
});

it('ignores non-AI-settings query messages', () => {
  const sendResponse = vi.fn();

  expect(
    routeAiSettingsQueryMessage(
      { operation: 'read-model-selection-bootstrap', type: MessageType.AI_SETTINGS_MUTATION },
      {},
      sendResponse,
      createRouteContext()
    )
  ).toBe(false);

  expect(sendResponse).not.toHaveBeenCalled();
  expect(routeMocks.resolveAISettingsQueryResponse).not.toHaveBeenCalled();
});

it('rejects AI settings queries when the route context is bound to another operation', () => {
  const sendResponse = vi.fn();

  expect(
    routeAiSettingsQueryMessage(
      {
        operation: 'read-model-selection-bootstrap',
        type: MessageType.AI_SETTINGS_QUERY,
      },
      { tab: { id: 7 } as chrome.tabs.Tab },
      sendResponse,
      createRouteContext('read-settings-page-runtime-data')
    )
  ).toBe(true);

  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized AI settings query sender',
    success: false,
  });
  expect(routeMocks.resolveAISettingsQueryResponse).not.toHaveBeenCalled();
});

it('returns an error response when AI settings query resolution fails', async () => {
  const sendResponse = vi.fn();
  routeMocks.resolveAISettingsQueryResponse.mockRejectedValueOnce(new Error('storage denied'));

  expect(
    routeAiSettingsQueryMessage(
      {
        operation: 'read-model-selection-bootstrap',
        type: MessageType.AI_SETTINGS_QUERY,
      },
      { tab: { id: 7 } as chrome.tabs.Tab },
      sendResponse,
      createRouteContext()
    )
  ).toBe(true);

  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({
      error: 'storage denied',
      success: false,
    })
  );
  expect(routeMocks.loggerError).toHaveBeenCalled();
});
