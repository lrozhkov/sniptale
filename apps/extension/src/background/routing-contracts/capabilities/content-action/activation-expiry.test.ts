import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  CaptureMessageType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';
import type * as ContentActionContract from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import type { ContentPrivilegedActionType } from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import {
  resetContentPrivilegedActionCapabilitiesForTests,
  routeContentPrivilegedActionActivationKeyRequest,
  routeContentPrivilegedActionRuntimeTokenRequest,
} from './route';
import { getContentPrivilegedActionActivationIssueHistorySizeForTests } from './activation-store';
import { resolveContentSenderBindingForTest } from './test-support';

let dateNowMock: ReturnType<typeof vi.spyOn>;

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

function contentSender(
  overrides: Partial<chrome.runtime.MessageSender> = {}
): chrome.runtime.MessageSender {
  return {
    documentId: 'content-doc-1',
    frameId: 0,
    tab: { id: 7 } as chrome.tabs.Tab,
    url: 'https://example.test/page',
    ...overrides,
  };
}

function requestActivationKey(
  sender: chrome.runtime.MessageSender = contentSender()
): ContentActionContract.ContentPrivilegedActionActivationKey | undefined {
  const sendResponse = vi.fn();
  routeContentPrivilegedActionActivationKeyRequest(
    {
      purpose: 'trusted-content-event',
      type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
    },
    sender,
    sendResponse,
    resolveContentSenderBindingForTest(sender)
  );
  return (
    sendResponse.mock.calls[0]?.[0] as {
      activationKey?: ContentActionContract.ContentPrivilegedActionActivationKey;
    }
  ).activationKey;
}

function requestRuntimeToken(
  activationProof: ContentActionContract.ContentPrivilegedActionActivationKey,
  actionType: ContentPrivilegedActionType = CaptureMessageType.CAPTURE_VISIBLE
) {
  const sender = contentSender();
  const sendResponse = vi.fn();
  routeContentPrivilegedActionRuntimeTokenRequest(
    {
      actionType,
      activationProof,
      requestId: 'request-1',
      type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
    },
    sender,
    sendResponse,
    resolveContentSenderBindingForTest(sender)
  );
  return sendResponse.mock.calls[0]?.[0];
}

function requireActivationKey(
  activationKey: ContentActionContract.ContentPrivilegedActionActivationKey | undefined
): ContentActionContract.ContentPrivilegedActionActivationKey {
  if (!activationKey) {
    throw new Error('Expected activation key response.');
  }
  return activationKey;
}

beforeEach(() => {
  let tokenIndex = 0;
  resetContentPrivilegedActionCapabilitiesForTests();
  dateNowMock = vi.spyOn(Date, 'now').mockReturnValue(1_000);
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => {
      tokenIndex += 1;
      return `content-token-${tokenIndex}`;
    }),
  });
});

afterEach(() => {
  resetContentPrivilegedActionCapabilitiesForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('expires activation roots and allows the sender to claim a fresh root after pruning', () => {
  const firstKey = requireActivationKey(requestActivationKey());
  expect(firstKey).toEqual({
    expiresAtEpochMs: 31_000,
    keyId: 'content-token-1',
    secret: 'content-token-2',
  });
  expect(requestRuntimeToken(firstKey)).toEqual({
    runtimeToken: { runtimeToken: 'content-token-3' },
    success: true,
  });

  dateNowMock.mockReturnValue(31_001);
  expect(requestRuntimeToken(firstKey)).toMatchObject({
    error: 'Unauthorized content action activation proof',
    success: false,
  });
  expect(requestActivationKey()).toEqual({
    expiresAtEpochMs: 61_001,
    keyId: 'content-token-4',
    secret: 'content-token-5',
  });
});

it('does not rate limit activation roots consumed by consecutive trusted actions', () => {
  const actionTypes = [
    CaptureMessageType.CAPTURE_VISIBLE,
    MessageType.ENABLE_SCREENSHOT_MODE,
    MessageType.TRIGGER_QUICK_ACTION,
    MessageType.CONTENT_RUNTIME_WAKEUP,
    MessageType.OPEN_EXPORT_MODAL,
    MessageType.EXECUTE_SAVE,
  ] as const;
  for (const [index, actionType] of actionTypes.entries()) {
    dateNowMock.mockReturnValue(1_000 + index * 31_000);
    const activationKey = requireActivationKey(requestActivationKey());
    expect(requestRuntimeToken(activationKey, actionType)).toMatchObject({ success: true });
  }

  dateNowMock.mockReturnValue(1_000 + 6 * 31_000);
  expect(requestActivationKey()).toEqual(expect.objectContaining({ expiresAtEpochMs: 217_000 }));
});

it('rate limits repeated abandoned activation roots for the same sender and purpose', () => {
  for (let index = 0; index < 6; index += 1) {
    dateNowMock.mockReturnValue(1_000 + index * 31_000);
    expect(requestActivationKey()).toEqual(
      expect.objectContaining({ expiresAtEpochMs: 31_000 + index * 31_000 })
    );
  }

  const sendResponse = vi.fn();
  const sender = contentSender();
  dateNowMock.mockReturnValue(1_000 + 6 * 31_000);
  routeContentPrivilegedActionActivationKeyRequest(
    {
      purpose: 'trusted-content-event',
      type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
    },
    sender,
    sendResponse,
    resolveContentSenderBindingForTest(sender)
  );

  expect(sendResponse.mock.calls[0]?.[0]).toMatchObject({
    error: 'Content action activation key rate limited',
    success: false,
  });
});

it('retains earlier abandoned-root strikes after a later trusted action succeeds', () => {
  for (let index = 0; index < 5; index += 1) {
    dateNowMock.mockReturnValue(1_000 + index * 31_000);
    expect(requestActivationKey()).toBeDefined();
  }

  dateNowMock.mockReturnValue(156_000);
  const consumedKey = requireActivationKey(requestActivationKey());
  expect(requestRuntimeToken(consumedKey, MessageType.CONTENT_RUNTIME_WAKEUP)).toMatchObject({
    success: true,
  });

  dateNowMock.mockReturnValue(187_000);
  expect(requestActivationKey()).toBeDefined();

  const sendResponse = vi.fn();
  const sender = contentSender();
  dateNowMock.mockReturnValue(218_000);
  routeContentPrivilegedActionActivationKeyRequest(
    {
      purpose: 'trusted-content-event',
      type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
    },
    sender,
    sendResponse,
    resolveContentSenderBindingForTest(sender)
  );

  expect(sendResponse.mock.calls[0]?.[0]).toMatchObject({
    error: 'Content action activation key rate limited',
    success: false,
  });
});

it('globally prunes activation issue history after the rate window', () => {
  for (let index = 0; index < 3; index += 1) {
    dateNowMock.mockReturnValue(1_000);
    expect(
      requestActivationKey(
        contentSender({
          documentId: `content-doc-${index}`,
          url: `https://example.test/page-${index}`,
        })
      )
    ).toEqual(expect.objectContaining({ keyId: `content-token-${index * 2 + 1}` }));
  }
  expect(getContentPrivilegedActionActivationIssueHistorySizeForTests()).toBe(3);

  dateNowMock.mockReturnValue(301_001);
  expect(requestActivationKey(contentSender({ documentId: 'content-doc-new' }))).toEqual(
    expect.objectContaining({ expiresAtEpochMs: 331_001 })
  );
  expect(getContentPrivilegedActionActivationIssueHistorySizeForTests()).toBe(1);
});
