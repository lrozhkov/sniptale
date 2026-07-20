import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  CaptureMessageType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';
import {
  resetContentPrivilegedActionCapabilitiesForTests,
  routeContentPrivilegedActionActivationKeyRequest,
  routeContentPrivilegedActionRuntimeTokenRequest,
} from './route';
import { resolveContentSenderBindingForTest } from './test-support';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

function contentSender(overrides: Partial<chrome.runtime.MessageSender> = {}) {
  return {
    documentId: 'content-doc-1',
    frameId: 0,
    tab: { id: 7 } as chrome.tabs.Tab,
    url: 'https://example.test/page',
    ...overrides,
  } satisfies chrome.runtime.MessageSender;
}

const activationRequest = {
  purpose: 'trusted-content-event' as const,
  type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
};

function requestActivationKey(sender: chrome.runtime.MessageSender) {
  const activationResponse = vi.fn();
  routeContentPrivilegedActionActivationKeyRequest(
    activationRequest,
    sender,
    activationResponse,
    resolveContentSenderBindingForTest(sender)
  );
  return activationResponse;
}

function requestRuntimeToken(
  sender: chrome.runtime.MessageSender,
  activationKey: unknown,
  response = vi.fn()
) {
  routeContentPrivilegedActionRuntimeTokenRequest(
    {
      activationProof: activationKey,
      actionType: CaptureMessageType.CAPTURE_VISIBLE,
      requestId: 'request-1',
      type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
    },
    sender,
    response,
    resolveContentSenderBindingForTest(sender)
  );
  return response;
}

function readActivationKey(response: ReturnType<typeof vi.fn>) {
  return (
    response.mock.calls[0]?.[0] as {
      activationKey?: { expiresAtEpochMs: number; keyId: string; secret: string };
    }
  ).activationKey;
}

beforeEach(() => {
  resetContentPrivilegedActionCapabilitiesForTests();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'content-token-1') });
});

afterEach(() => {
  resetContentPrivilegedActionCapabilitiesForTests();
  vi.unstubAllGlobals();
});

it('allows one activation-key claim per sender', () => {
  const sender = contentSender();
  const activationResponse = requestActivationKey(sender);

  expect(activationResponse.mock.calls[0]?.[0]).toEqual({
    activationKey: {
      expiresAtEpochMs: expect.any(Number),
      keyId: 'content-token-1',
      secret: 'content-token-1',
    },
    success: true,
  });

  const replayActivationResponse = requestActivationKey(sender);
  expect(replayActivationResponse.mock.calls[0]?.[0]).toMatchObject({
    error: 'Content action activation key already claimed',
    success: false,
  });
});

it('allows a sender to claim a new activation key after runtime token exchange consumes the prior key', () => {
  const sender = contentSender();
  const activationKey = readActivationKey(requestActivationKey(sender));

  const runtimeTokenResponse = requestRuntimeToken(sender, activationKey);
  expect(runtimeTokenResponse.mock.calls[0]?.[0]).toEqual({
    runtimeToken: { runtimeToken: 'content-token-1' },
    success: true,
  });

  const nextActivationResponse = requestActivationKey(sender);
  expect(nextActivationResponse.mock.calls[0]?.[0]).toEqual({
    activationKey: {
      expiresAtEpochMs: expect.any(Number),
      keyId: 'content-token-1',
      secret: 'content-token-1',
    },
    success: true,
  });
});

it('rejects forged activation proofs', () => {
  const sender = contentSender();
  const runtimeTokenResponse = vi.fn();
  const runtimeTokenRequest = {
    activationProof: {
      expiresAtEpochMs: Date.now() + 30_000,
      keyId: 'content-token-1',
      secret: 'wrong-secret',
    },
    actionType: CaptureMessageType.CAPTURE_VISIBLE,
    requestId: 'request-1',
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
  };
  routeContentPrivilegedActionRuntimeTokenRequest(
    runtimeTokenRequest,
    sender,
    runtimeTokenResponse,
    resolveContentSenderBindingForTest(sender)
  );
  expect(runtimeTokenResponse.mock.calls[0]?.[0]).toMatchObject({
    error: 'Unauthorized content action activation proof',
    success: false,
  });
});

it('binds activation keys to their privileged action purpose', () => {
  const sender = contentSender();
  const activationRequest = {
    purpose: 'recording-download' as const,
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
  };
  const activationResponse = vi.fn();
  routeContentPrivilegedActionActivationKeyRequest(
    activationRequest,
    sender,
    activationResponse,
    resolveContentSenderBindingForTest(sender)
  );
  const activationKey = (
    activationResponse.mock.calls[0]?.[0] as {
      activationKey?: { expiresAtEpochMs: number; keyId: string; secret: string };
    }
  ).activationKey;
  expect(activationKey).toBeDefined();

  const runtimeTokenResponse = vi.fn();
  const runtimeTokenRequest = {
    activationProof: activationKey ?? {
      expiresAtEpochMs: Date.now() + 30_000,
      keyId: 'missing',
      secret: 'missing',
    },
    actionType: MessageType.TRIGGER_QUICK_ACTION,
    requestId: 'request-1',
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
  };
  routeContentPrivilegedActionRuntimeTokenRequest(
    runtimeTokenRequest,
    sender,
    runtimeTokenResponse,
    resolveContentSenderBindingForTest(sender)
  );
  expect(runtimeTokenResponse.mock.calls[0]?.[0]).toMatchObject({
    error: 'Unauthorized content action activation proof',
    success: false,
  });
});
