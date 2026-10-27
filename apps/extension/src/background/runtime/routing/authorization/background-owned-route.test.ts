import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
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

it.each([CONTENT_URL, 'chrome-extension://test/apps/extension/src/video-editor/index.html'])(
  'admits bounded picker maintenance without granting provider-edit authority for %s',
  (url) => {
    const maintenance = {
      type: MessageType.AI_SETTINGS_MUTATION,
      operation: 'refresh-managed-catalogs',
    };
    const providerCheck = {
      type: MessageType.AI_SETTINGS_MUTATION,
      operation: 'refresh-provider-catalog',
      providerId: 'provider',
    };
    const contentSender = sender({ url, ...(url === CONTENT_URL ? { tabId: 41 } : {}) });
    expect(
      authorizeIPCMessage({ kind: 'background-owned', message: maintenance, sender: contentSender })
    ).toEqual({ authorized: true });
    expect(
      authorizeIPCMessage({
        kind: 'background-owned',
        message: providerCheck,
        sender: contentSender,
      }).authorized
    ).toBe(false);
    expect(
      authorizeIPCMessage({
        kind: 'background-owned',
        message: maintenance,
        sender: sender({ url: SETTINGS_URL + '?aiUnlock=1', tabId: 41 }),
      }).authorized
    ).toBe(false);
    expect(
      authorizeIPCMessage({
        kind: 'background-owned',
        message: maintenance,
        sender: sender({ url: CONTENT_URL }),
      }).authorized
    ).toBe(false);
  }
);

it.each([
  ['https://example.test/page', 41, 'page-edit', true],
  ['https://example.test/page', 41, 'gallery-speech', false],
  [
    'chrome-extension://test/apps/extension/src/gallery/index.html',
    undefined,
    'gallery-speech',
    true,
  ],
  ['chrome-extension://test/apps/extension/src/gallery/index.html', 41, 'page-edit', false],
  [
    'chrome-extension://test/apps/extension/src/video-editor/index.html',
    undefined,
    'video-transcription',
    true,
  ],
  [
    'chrome-extension://test/apps/extension/src/video-editor/index.html',
    41,
    'scenario-edit',
    false,
  ],
  [
    'chrome-extension://test/apps/extension/src/scenario-editor/index.html',
    undefined,
    'scenario-edit',
    true,
  ],
  [
    'chrome-extension://test/apps/extension/src/settings/index.html?aiUnlock=1',
    41,
    'page-edit',
    false,
  ],
] as const)(
  'scopes scenario selection reads and writes to %s and %s for %s',
  (url, tabId, scenario, allowed) => {
    const selection = {
      scenario,
      modelId: 'model',
      providerId: 'provider',
      modelCode: 'exact-code',
      destinationBinding: VALID_CONTENT_HASH,
      source: 'explicit',
    };
    const mutation = {
      type: MessageType.AI_SETTINGS_MUTATION,
      operation: 'remember-scenario-selection',
      selection,
    };
    const query = {
      type: MessageType.AI_SETTINGS_QUERY,
      operation: 'read-scenario-selection',
      scenario,
    };
    const actor = sender({ url, ...(tabId === undefined ? {} : { tabId }) });
    expect(
      authorizeIPCMessage({ kind: 'background-owned', message: mutation, sender: actor }).authorized
    ).toBe(allowed);
    expect(
      authorizeIPCMessage({ kind: 'background-owned', message: query, sender: actor }).authorized
    ).toBe(allowed);
  }
);

it.each([
  [SETTINGS_URL, true],
  [CONTENT_URL, false],
  [POPUP_URL, false],
  ['chrome-extension://test/apps/extension/src/gallery/index.html', false],
  [`${SETTINGS_URL}?aiUnlock=1`, false],
])('restricts provider enabled patches to ordinary Settings: %s', (url, allowed) => {
  const message = {
    type: MessageType.AI_SETTINGS_MUTATION,
    operation: 'set-provider-enabled',
    providerId: 'provider',
    providerIncarnation: 'incarnation',
    enabled: false,
  };
  expect(
    authorizeIPCMessage({ kind: 'background-owned', message, sender: sender({ url }) }).authorized
  ).toBe(allowed);
  expect(hasPreauthorizedAiSettingsMutationMessage(message)).toBe(allowed);
});
