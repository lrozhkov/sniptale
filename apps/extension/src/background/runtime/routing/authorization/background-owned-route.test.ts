import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { SyncProductCommand } from '../../../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import type { AiEgressAuthority } from '../../../../features/ai/egress-authority';
import { resetAISecretUnlockRequestsForTests } from '../../../ai/settings/secret-unlock-route';
import { resetLlmSessionTokensForTests } from '../../../ai/llm/session-tokens';
import { hasPreauthorizedAiSettingsMutationMessage } from '../../../ai/settings/authorization/preauthorization';
import { hasPreauthorizedLlmSessionRequestMessage } from '../../../ai/llm/authorization/preauthorization';
import { authorizeIPCMessage } from './index';
import { hasPreauthorizedPopupTabRouteCapabilityRequestMessage } from '../capabilities/popup-tab/preauthorization';

const CONTENT_URL = 'https://example.test/page';
const POPUP_URL = 'chrome-extension://test/apps/extension/src/popup/index.html';
const SETTINGS_URL = 'chrome-extension://test/apps/extension/src/settings/index.html';
const VALID_CONTENT_HASH =
  'sha256:1111111111111111111111111111111111111111111111111111111111111111';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

function sender(props: {
  documentId?: string;
  frameId?: number;
  tabId?: number;
  url?: string;
}): chrome.runtime.MessageSender {
  return {
    ...(props.documentId === undefined ? {} : { documentId: props.documentId }),
    ...(props.frameId === undefined ? {} : { frameId: props.frameId }),
    ...(props.tabId === undefined ? {} : { tab: { id: props.tabId } as chrome.tabs.Tab }),
    ...(props.url === undefined ? {} : { url: props.url }),
  };
}

function createContentAuthority(): AiEgressAuthority {
  return {
    captureMode: 'selected_editable',
    contractVersion: 1,
    payloadHash: VALID_CONTENT_HASH,
    purpose: 'content-ai-pick',
    riskClass: 'safe_text',
  };
}

beforeEach(() => {
  resetAISecretUnlockRequestsForTests();
  resetLlmSessionTokensForTests();
  vi.stubGlobal('crypto', { randomUUID: () => 'token-1' });
});

afterEach(() => {
  resetAISecretUnlockRequestsForTests();
  resetLlmSessionTokensForTests();
  vi.unstubAllGlobals();
});

it('preauthorizes AI settings mutations only from the settings page', () => {
  const settingsMessage = {
    operation: 'save-global-prompt',
    prompt: 'Prompt',
    type: MessageType.AI_SETTINGS_MUTATION,
  };
  const defaultModelMessage = {
    defaultModelId: 'model-1',
    operation: 'save-default-model',
    type: MessageType.AI_SETTINGS_MUTATION,
  };

  expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message: settingsMessage,
      sender: sender({ url: SETTINGS_URL }),
    })
  ).toEqual({ authorized: true });
  expect(hasPreauthorizedAiSettingsMutationMessage(settingsMessage)).toBe(true);

  expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message: defaultModelMessage,
      sender: sender({ url: SETTINGS_URL }),
    })
  ).toEqual({ authorized: true });
  expect(hasPreauthorizedAiSettingsMutationMessage(defaultModelMessage)).toBe(true);
});

it('authorizes read-only AI settings queries without granting mutation authority', () => {
  const queryMessage = {
    operation: 'read-model-selection-bootstrap',
    type: MessageType.AI_SETTINGS_QUERY,
  };

  expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message: queryMessage,
      sender: sender({ tabId: 7, url: CONTENT_URL }),
    })
  ).toEqual(
    expect.objectContaining({
      authorized: true,
      preauthorization: expect.objectContaining({
        kind: 'background-owned-route',
      }),
    })
  );
  expect(hasPreauthorizedAiSettingsMutationMessage(queryMessage)).toBe(false);
});

it('rejects content AI default-model mutation and capability requests', () => {
  const contentSender = sender({ tabId: 7, url: CONTENT_URL });
  const defaultModelMessage = {
    defaultModelId: 'model-1',
    operation: 'save-default-model',
    type: MessageType.AI_SETTINGS_MUTATION,
  };

  expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message: defaultModelMessage,
      sender: contentSender,
    })
  ).toEqual({ authorized: false, reason: 'Unauthorized AI settings mutation sender' });
});

it('preauthorizes LLM session issuance and popup tab-route capability issuance senders', () => {
  const llmMessage = {
    egressAuthority: createContentAuthority(),
    purpose: 'content-ai-pick',
    type: MessageType.REQUEST_LLM_SESSION,
  };
  const popupMessage = {
    operation: MessageType.EXPORT_POPUP_PREVIEW,
    requestId: 'route-req-1',
    tabId: 7,
    type: MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY,
  };

  expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message: llmMessage,
      sender: sender({ documentId: 'doc-1', frameId: 0, tabId: 7, url: CONTENT_URL }),
    })
  ).toEqual({ authorized: true });
  expect(hasPreauthorizedLlmSessionRequestMessage(llmMessage)).toBe(true);
  expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message: popupMessage,
      sender: sender({ url: POPUP_URL }),
    })
  ).toEqual({ authorized: true });
  expect(hasPreauthorizedPopupTabRouteCapabilityRequestMessage(popupMessage)).toBe(true);
});

it('preauthorizes AI secret unlock starts only for LLM-capable senders', () => {
  const message = {
    operation: 'start',
    purpose: 'content-ai-pick',
    type: MessageType.AI_SECRET_UNLOCK,
  };

  expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message,
      sender: sender({ documentId: 'doc-1', frameId: 0, tabId: 7, url: CONTENT_URL }),
    })
  ).toEqual(
    expect.objectContaining({
      authorized: true,
      preauthorization: expect.objectContaining({
        kind: 'background-owned-route',
        routeContext: expect.objectContaining({
          authorityFamily: 'ai-secret-unlock-authority',
          preauthorization: { kind: 'ai-secret-unlock-route' },
          senderClassification: 'content-tab-runtime',
        }),
      }),
    })
  );
  expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message: { ...message },
      sender: sender({ url: CONTENT_URL }),
    })
  ).toEqual({ authorized: false, reason: 'Unauthorized AI secret unlock sender' });
});

it('authorizes page-access requests only from extension UI pages', () => {
  const message = {
    operation: 'read-status',
    type: MessageType.PAGE_ACCESS,
  };

  expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message,
      sender: sender({ url: POPUP_URL }),
    })
  ).toEqual({ authorized: true });
  expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message: { ...message },
      sender: sender({ url: SETTINGS_URL }),
    })
  ).toEqual({ authorized: true });
  expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message: { ...message },
      sender: sender({ documentId: 'doc-1', frameId: 0, tabId: 7, url: CONTENT_URL }),
    })
  ).toEqual({ authorized: false, reason: 'Unauthorized page access sender' });
});

it('authorizes local data erasure only from the owned settings page', () => {
  const message = {
    includeAiProviderSecrets: false,
    preservePreferences: true,
    type: MessageType.ERASE_LOCAL_EXTENSION_DATA,
  };

  expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message,
      sender: sender({ url: SETTINGS_URL }),
    })
  ).toEqual({ authorized: true });
  expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message: { ...message },
      sender: sender({ url: POPUP_URL }),
    })
  ).toEqual({ authorized: false, reason: 'Unauthorized local data erasure sender' });
  expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message: { ...message },
      sender: sender({ documentId: 'doc-1', frameId: 0, tabId: 7, url: CONTENT_URL }),
    })
  ).toEqual({ authorized: false, reason: 'Unauthorized local data erasure sender' });
});

const productRequestId = '11111111-1111-4111-8111-111111111111';
const productGallery = 'chrome-extension://test/apps/extension/src/gallery/index.html';
const productCreate = {
  kind: 'workspace-create' as const,
  parentUrl: 'https://dav.test/root/',
  accountId: 'alice',
  authentication: { kind: 'bearer' as const, accessToken: 'private-token' },
};
const productReplica = {
  kind: 'replica-prepare' as const,
  selection: {
    rootKind: 'video-project' as const,
    rootId: 'project',
    operationId: 'operation',
    sourceDigest: 'a'.repeat(64),
  },
};

function authorizeProduct(
  command: SyncProductCommand,
  productSender: chrome.runtime.MessageSender
) {
  return authorizeIPCMessage({
    kind: 'background-owned',
    message: { type: MessageType.SYNC_PRODUCT_COMMAND, requestId: productRequestId, command },
    sender: productSender,
  });
}

it('authorizes product commands only for the document that owns each verb', () => {
  expect(authorizeProduct(productCreate, sender({ url: SETTINGS_URL }))).toEqual({
    authorized: true,
  });
  expect(authorizeProduct(productReplica, sender({ url: productGallery }))).toEqual({
    authorized: true,
  });
  for (const productSender of [sender({ url: SETTINGS_URL }), sender({ url: productGallery })]) {
    expect(authorizeProduct({ kind: 'status' }, productSender)).toEqual({ authorized: true });
    expect(
      authorizeProduct({ kind: 'catalog-refresh', bypassCache: false }, productSender)
    ).toEqual({ authorized: true });
  }
  expect(authorizeProduct(productCreate, sender({ url: productGallery }))).toEqual({
    authorized: false,
    reason: 'Sync product command refused',
  });
  expect(authorizeProduct(productReplica, sender({ url: SETTINGS_URL }))).toEqual({
    authorized: false,
    reason: 'Sync product command refused',
  });
});

it('rejects malformed product commands and untrusted or inactive product documents', () => {
  const senders: chrome.runtime.MessageSender[] = [
    sender({ url: CONTENT_URL, frameId: 0, tabId: 7 }),
    sender({ url: productGallery, frameId: 1 }),
    sender({ url: `${SETTINGS_URL}?aiUnlock=1` }),
    { ...sender({ url: SETTINGS_URL }), documentLifecycle: 'cached' },
  ];
  for (const productSender of senders) {
    expect(authorizeProduct({ kind: 'status' }, productSender)).toEqual({
      authorized: false,
      reason: 'Sync product command refused',
    });
  }
  expect(
    authorizeProduct(
      {
        ...productReplica,
        selection: { ...productReplica.selection, sourceDigest: 'invalid' },
      },
      sender({ url: productGallery })
    )
  ).toEqual({
    authorized: false,
    reason: 'Sync product command refused',
  });
});
