// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  handleOffscreenRuntimeMessage,
  resolveOffscreenErrorPhase,
  resolveOffscreenRuntimeResponseMode,
} from './routing';

beforeEach(() => {
  window.localStorage.clear();
});

it('erases and verifies extension-origin localStorage through the offscreen owner', async () => {
  window.localStorage.setItem('sniptale-theme-preference', 'dark');
  window.localStorage.setItem('sniptale:trace:namespaces', 'diagnostics');
  const sendResponse = vi.fn();

  await handleOffscreenRuntimeMessage(
    {
      type: MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE,
      capabilityToken: 'capability',
      operation: 'erase',
      preservePreferences: true,
    },
    sendResponse
  );

  expect(sendResponse).toHaveBeenCalledWith({ success: true, empty: true, removedCount: 1 });
  expect(window.localStorage.getItem('sniptale-theme-preference')).toBe('dark');
  expect(window.localStorage.getItem('sniptale:trace:namespaces')).toBeNull();
});

it('fails verification when a targeted page-local key remains', async () => {
  const storage = window.localStorage;
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => undefined);
  storage.setItem('sniptale:trace:namespaces', 'diagnostics');

  await expect(
    handleOffscreenRuntimeMessage(
      {
        type: MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE,
        capabilityToken: 'capability',
        operation: 'erase',
        preservePreferences: true,
      },
      vi.fn()
    )
  ).rejects.toThrow('Extension page local storage erasure verification failed');
});

it('verifies without mutation and owns the manual runtime response mode', async () => {
  await expect(
    handleOffscreenRuntimeMessage({
      type: MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE,
      capabilityToken: 'capability',
      operation: 'verify',
      preservePreferences: false,
    })
  ).resolves.toBeUndefined();

  expect(resolveOffscreenErrorPhase(MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE)).toBe(
    'runtime'
  );
  expect(
    resolveOffscreenRuntimeResponseMode(MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE)
  ).toBe('manual');
});
