import { beforeEach, expect, it, vi } from 'vitest';

import type { AISecretUnlockMessage } from '../../../../contracts/messaging/ai-secret-unlock';
import { authorizeAISecretUnlockSenderForState, buildUnlockUrl } from './secret-unlock';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://extension-id/${path}`,
  },
}));

function createContentSender(args: {
  documentId?: string;
  frameId?: number;
  tabId: number;
  url?: string;
}): chrome.runtime.MessageSender {
  const sender: chrome.runtime.MessageSender = {
    tab: { id: args.tabId } as chrome.tabs.Tab,
  };
  if (args.documentId !== undefined) {
    sender.documentId = args.documentId;
  }
  if (args.frameId !== undefined) {
    sender.frameId = args.frameId;
  }
  if (args.url !== undefined) {
    sender.url = args.url;
  }
  return sender;
}

function createScenarioSender(documentId?: string): chrome.runtime.MessageSender {
  const sender: chrome.runtime.MessageSender = {
    url: 'chrome-extension://extension-id/apps/extension/src/scenario-editor/index.html',
  };
  if (documentId !== undefined) {
    sender.documentId = documentId;
  }
  return sender;
}

function createStatusMessage(requestId = 'request-1'): AISecretUnlockMessage {
  return { operation: 'status', requestId, type: 'AI_SECRET_UNLOCK' };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('authorizes status reads only for the pending request owner', () => {
  const sender = createContentSender({
    documentId: 'doc-1',
    frameId: 0,
    tabId: 7,
    url: 'https://example.test',
  });

  expect(
    authorizeAISecretUnlockSenderForState({
      message: createStatusMessage(),
      record: { senderKey: 'tab:7:frame:0:document:doc-1' },
      sender,
    })
  ).toBeNull();

  expect(
    authorizeAISecretUnlockSenderForState({
      message: createStatusMessage(),
      record: { senderKey: 'tab:8:frame:0:document:doc-1' },
      sender,
    })
  ).toBe('Unauthorized AI secret unlock status reader');
});

it('coarsely authorizes status readers when session state must be recovered', () => {
  expect(
    authorizeAISecretUnlockSenderForState({
      message: createStatusMessage('unknown-request'),
      sender: createContentSender({
        documentId: 'doc-1',
        frameId: 0,
        tabId: 7,
        url: 'https://example.test',
      }),
    })
  ).toBeNull();

  expect(
    authorizeAISecretUnlockSenderForState({
      message: createStatusMessage('unknown-request'),
      sender: { url: 'https://example.test/' },
    })
  ).toBe('Unauthorized AI secret unlock status reader');
});

it('binds scenario editor unlock status ownership to document id', () => {
  expect(
    authorizeAISecretUnlockSenderForState({
      message: createStatusMessage(),
      record: { senderKey: 'scenario-editor:document:scenario-doc-1' },
      sender: createScenarioSender('scenario-doc-1'),
    })
  ).toBeNull();

  expect(
    authorizeAISecretUnlockSenderForState({
      message: createStatusMessage(),
      record: { senderKey: 'scenario-editor:document:scenario-doc-1' },
      sender: createScenarioSender('scenario-doc-2'),
    })
  ).toBe('Unauthorized AI secret unlock status reader');
});

it('authorizes unlock-page submit and cancel only for the matching request id', () => {
  const sender = { url: buildUnlockUrl('request-1') };

  expect(
    authorizeAISecretUnlockSenderForState({
      message: {
        operation: 'submit',
        passphrase: 'secret',
        requestId: 'request-1',
        type: 'AI_SECRET_UNLOCK',
      },
      sender,
    })
  ).toBeNull();

  expect(
    authorizeAISecretUnlockSenderForState({
      message: { operation: 'cancel', requestId: 'request-2', type: 'AI_SECRET_UNLOCK' },
      sender,
    })
  ).toBe('Unauthorized AI secret unlock canceller');
});

it('rejects malformed unlock-page submitters without a request id', () => {
  expect(
    authorizeAISecretUnlockSenderForState({
      message: {
        operation: 'submit',
        passphrase: 'secret',
        requestId: 'request-1',
        type: 'AI_SECRET_UNLOCK',
      },
      sender: {
        url: 'chrome-extension://extension-id/apps/extension/src/settings/index.html?aiUnlock=1',
      },
    })
  ).toBe('Unauthorized AI secret unlock submitter');
});
