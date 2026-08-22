import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AiSettingsQueryMessage } from '../../../../contracts/messaging/ai-settings-runtime';
import type { BackgroundOwnedAuthorizationRequest } from './background-owned.types';

vi.mock('../../../routing-contracts/capabilities/content-action/route', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../routing-contracts/capabilities/content-action/route')
  >()),
  consumeContentPrivilegedActionCapabilityBinding: vi.fn((args) =>
    args.contentIntent?.token === 'valid-token'
      ? { documentId: 'document-7', frameId: 0, senderUrl: 'https://page.test', tabId: 7 }
      : null
  ),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

import { authorizeBackgroundOwnedRoute } from './owned';

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

it('authorizes AI settings navigation only from an owned top-frame content runtime', () => {
  const message = {
    contentIntent: { requestId: 'request-1', token: 'valid-token' },
    section: 'ai-prompts' as const,
    type: MessageType.AI_SETTINGS_NAVIGATION,
  };
  expect(
    authorizeBackgroundOwnedRoute({ kind: 'background-owned', message, sender: contentSender() })
  ).toEqual(expect.objectContaining({ authorized: true }));
  expect(
    authorizeBackgroundOwnedRoute({ kind: 'background-owned', message, sender: settingsSender() })
  ).toEqual({
    authorized: false,
    reason: 'Unauthorized AI settings navigation sender',
  });
  expect(
    authorizeBackgroundOwnedRoute({
      kind: 'background-owned',
      message: { ...message, contentIntent: { requestId: 'request-1', token: 'replayed' } },
      sender: contentSender(),
    })
  ).toEqual({
    authorized: false,
    reason: 'Unauthorized AI settings navigation intent',
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
  return {
    documentId: 'document-7',
    frameId: 0,
    tab: { id: 7 } as chrome.tabs.Tab,
    url: 'https://page.test',
  };
}

function scenarioSender(): chrome.runtime.MessageSender {
  return {
    url: 'chrome-extension://test/apps/extension/src/scenario-editor/index.html?projectId=p1',
  };
}

function settingsSender(): chrome.runtime.MessageSender {
  return { url: 'chrome-extension://test/apps/extension/src/settings/index.html' };
}
