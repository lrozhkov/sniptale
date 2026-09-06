// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { installContentRuntimeMessagingMock } from '../../../../application/runtime-services/services.test-support';

const runtimeMocks = vi.hoisted(() => ({
  sendRuntimeMessage: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  warn: vi.fn(),
}));

const intentMocks = vi.hoisted(() => ({
  attachContentActionIntent: vi.fn(
    async (message: Record<string, unknown>, source?: { kind: string }) =>
      source
        ? {
            ...message,
            contentIntent: { requestId: 'pin-request-1', token: 'pin-token-1' },
          }
        : message
  ),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => loggerMocks,
}));

vi.mock('../../../../application/privileged-action-intent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../application/privileged-action-intent')>()),
  attachContentActionIntent: intentMocks.attachContentActionIntent,
}));

vi.mock('../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: runtimeMocks.sendRuntimeMessage,
}));

import {
  loadContentPinToTabSessionState,
  readContentPinToTabSessionState,
  writeContentPinToTabSessionState,
} from './pin-session';

beforeEach(() => {
  installContentRuntimeMessagingMock(runtimeMocks.sendRuntimeMessage);
  runtimeMocks.sendRuntimeMessage.mockReset();
  runtimeMocks.sendRuntimeMessage.mockResolvedValue({
    pinToTab: false,
    pinToTabAvailable: true,
    restored: false,
    success: true,
  });
  loggerMocks.warn.mockReset();
  window.sessionStorage.clear();
});

it('does not treat page window session storage as authoritative initial state', () => {
  window.sessionStorage.setItem('sniptale.content.pin-to-tab', 'true');

  expect(readContentPinToTabSessionState()).toBe(false);
});

it('hydrates pin state through the authorized background owner', async () => {
  runtimeMocks.sendRuntimeMessage.mockResolvedValueOnce({
    pinToTab: true,
    pinToTabAvailable: true,
    reason: 'pin-to-tab',
    restored: true,
    success: true,
    toolbarVisible: false,
  });

  await expect(loadContentPinToTabSessionState()).resolves.toEqual({
    pinToTab: true,
    pinToTabAvailable: true,
    toolbarVisible: false,
  });
  expect(runtimeMocks.sendRuntimeMessage).toHaveBeenCalledWith({
    type: 'CONTENT_RUNTIME_WAKEUP',
  });
});

it('does not confuse scenario restoration with a user pin', async () => {
  runtimeMocks.sendRuntimeMessage.mockResolvedValueOnce({
    pinToTab: false,
    pinToTabAvailable: true,
    reason: 'scenario',
    restored: true,
    success: true,
  });

  await expect(loadContentPinToTabSessionState()).resolves.toEqual({
    pinToTab: false,
    pinToTabAvailable: true,
    toolbarVisible: true,
  });
});

it('fails closed and reports an invalid background response', async () => {
  runtimeMocks.sendRuntimeMessage.mockResolvedValueOnce({ success: true });

  await expect(loadContentPinToTabSessionState()).resolves.toEqual({
    pinToTab: false,
    pinToTabAvailable: false,
    toolbarVisible: true,
  });
  expect(loggerMocks.warn).toHaveBeenCalledWith(
    'Failed to load authoritative pin-to-tab session state',
    expect.any(Error)
  );
});

it('silently falls back when an obsolete content script loses its extension context', async () => {
  runtimeMocks.sendRuntimeMessage.mockRejectedValueOnce(
    new Error('Extension context invalidated.')
  );

  await expect(loadContentPinToTabSessionState()).resolves.toEqual({
    pinToTab: false,
    pinToTabAvailable: false,
    toolbarVisible: true,
  });
  expect(loggerMocks.warn).not.toHaveBeenCalled();
});

it('persists pin state through the background owner', async () => {
  runtimeMocks.sendRuntimeMessage.mockResolvedValueOnce({
    pinToTab: true,
    pinToTabAvailable: true,
    reason: 'pin-to-tab',
    restored: true,
    success: true,
  });

  await expect(writeContentPinToTabSessionState(true)).resolves.toEqual({
    pinToTabAvailable: true,
    status: 'acknowledged',
    value: true,
  });
  expect(runtimeMocks.sendRuntimeMessage).toHaveBeenCalledWith({
    pinToTab: true,
    type: 'CONTENT_RUNTIME_WAKEUP',
  });
  expect(window.sessionStorage.getItem('sniptale.content.pin-to-tab')).toBeNull();
});

it('binds pin activation to its trusted toolbar event before mutating the session owner', async () => {
  runtimeMocks.sendRuntimeMessage.mockResolvedValueOnce({
    pinToTab: true,
    pinToTabAvailable: true,
    reason: 'pin-to-tab',
    restored: true,
    success: true,
  });
  const source = { kind: 'trusted-content-event' as const };

  await expect(writeContentPinToTabSessionState(true, () => true, source)).resolves.toEqual({
    pinToTabAvailable: true,
    status: 'acknowledged',
    value: true,
  });

  expect(intentMocks.attachContentActionIntent).toHaveBeenCalledWith(
    { pinToTab: true, type: 'CONTENT_RUNTIME_WAKEUP' },
    source
  );
  expect(runtimeMocks.sendRuntimeMessage).toHaveBeenCalledWith({
    contentIntent: { requestId: 'pin-request-1', token: 'pin-token-1' },
    pinToTab: true,
    type: 'CONTENT_RUNTIME_WAKEUP',
  });
});

it('rejects an unconfirmed background write for UI rollback', async () => {
  runtimeMocks.sendRuntimeMessage.mockResolvedValueOnce({ success: false });

  await expect(writeContentPinToTabSessionState(true)).rejects.toThrow(
    'Background pin-to-tab session owner returned an invalid response'
  );
  expect(loggerMocks.warn).toHaveBeenCalledWith(
    'Failed to persist authoritative pin-to-tab session state',
    expect.any(Error)
  );
});

it('skips a stale write before crossing the runtime boundary', async () => {
  await expect(writeContentPinToTabSessionState(true, () => false)).resolves.toEqual({
    status: 'superseded',
  });

  expect(runtimeMocks.sendRuntimeMessage).not.toHaveBeenCalled();
});
