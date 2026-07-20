import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AiSettingsQueryMessage } from '../../../../contracts/messaging/ai-settings-runtime';
import type { BackgroundOwnedAuthorizationRequest } from './background-owned.types';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

import { authorizeBackgroundOwnedRoute } from './background-owned';

function aiSettingsQueryRequest(
  message: AiSettingsQueryMessage,
  sender: chrome.runtime.MessageSender
): BackgroundOwnedAuthorizationRequest {
  return {
    kind: 'background-owned',
    message,
    sender,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('authorizes AI settings queries only for their intended runtime owners', () => {
  expect(authorizeQuery('read-settings-page-runtime-data', settingsSender())).toEqual(
    expect.objectContaining({ authorized: true })
  );
  expect(authorizeQuery('read-model-selection-bootstrap', contentSender())).toEqual(
    expect.objectContaining({ authorized: true })
  );
  expect(authorizeQuery('read-scenario-editor-system-prompt', scenarioSender())).toEqual(
    expect.objectContaining({ authorized: true })
  );
});

it('rejects cross-owner AI settings queries that would reveal privileged settings data', () => {
  expect(authorizeQuery('read-settings-page-runtime-data', contentSender())).toEqual({
    authorized: false,
    reason: 'Unauthorized AI settings query sender',
  });
  expect(
    authorizeBackgroundOwnedRoute(
      aiSettingsQueryRequest(
        {
          modelId: 'model-1',
          operation: 'read-chrome-ai-content-system-prompt',
          type: MessageType.AI_SETTINGS_QUERY,
        },
        settingsSender()
      )
    )
  ).toEqual({
    authorized: false,
    reason: 'Unauthorized AI settings query sender',
  });
});

function authorizeQuery(
  operation: Exclude<AiSettingsQueryMessage['operation'], 'read-chrome-ai-content-system-prompt'>,
  sender: chrome.runtime.MessageSender
) {
  return authorizeBackgroundOwnedRoute(
    aiSettingsQueryRequest(
      {
        operation,
        type: MessageType.AI_SETTINGS_QUERY,
      },
      sender
    )
  );
}

function contentSender(): chrome.runtime.MessageSender {
  return { tab: { id: 7 } as chrome.tabs.Tab, url: 'https://page.test' };
}

function scenarioSender(): chrome.runtime.MessageSender {
  return {
    url: 'chrome-extension://test/apps/extension/src/scenario-editor/index.html?projectId=p1',
  };
}

function settingsSender(): chrome.runtime.MessageSender {
  return { url: 'chrome-extension://test/apps/extension/src/settings/index.html' };
}
