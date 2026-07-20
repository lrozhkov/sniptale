// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BrowserStorageChangeListener } from '@sniptale/platform/browser/storage-types';
import type { QuickAction } from '../../../contracts/settings';

const trustedEventMocks = vi.hoisted(() => ({
  isTrustedKeyboardEvent: vi.fn(() => true),
}));

vi.mock('../trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../trusted-events')>()),
  isTrustedKeyboardEvent: trustedEventMocks.isTrustedKeyboardEvent,
}));

import { createQuickActionHotkeyRuntime, type QuickActionHotkeyAction } from '.';

function createQuickAction(overrides: Partial<QuickAction> = {}): QuickAction {
  return {
    afterCapture: 'copy',
    bundledId: null,
    delay: null,
    emulation: null,
    exitAfterCapture: false,
    hotkey: {
      altKey: false,
      ctrlKey: true,
      key: 'k',
      metaKey: false,
      shiftKey: false,
    },
    icon: 'bolt',
    id: 'quick-action-1',
    imageFormat: 'png',
    imageQuality: 100,
    name: 'Quick Action',
    origin: 'user',
    screenshotMode: 'visible',
    status: true,
    ...overrides,
  };
}

function createTriggerQuickAction() {
  return vi.fn(
    async (_action: QuickActionHotkeyAction, _event: KeyboardEvent): Promise<void> => undefined
  );
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  trustedEventMocks.isTrustedKeyboardEvent.mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

it('matches enabled quick-action hotkeys and calls the trigger owner', async () => {
  const triggerQuickAction = createTriggerQuickAction();
  const runtime = createQuickActionHotkeyRuntime({
    getActions: async () => [createQuickAction()],
    triggerQuickAction,
  });

  runtime.start();
  await flushAsyncWork();
  window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: 'k' }));
  await flushAsyncWork();
  runtime.stop();

  expect(triggerQuickAction).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'quick-action-1' }),
    expect.any(KeyboardEvent)
  );
});

it('matches quick-action hotkeys across Latin and Cyrillic keyboard layouts', async () => {
  const triggerQuickAction = createTriggerQuickAction();
  const runtime = createQuickActionHotkeyRuntime({
    getActions: async () => [createQuickAction()],
    triggerQuickAction,
  });

  runtime.start();
  await flushAsyncWork();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK', ctrlKey: true, key: 'л' }));
  await flushAsyncWork();
  runtime.stop();

  expect(triggerQuickAction).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'quick-action-1' }),
    expect.any(KeyboardEvent)
  );
});

it('ignores editable and untrusted keyboard events', async () => {
  const triggerQuickAction = createTriggerQuickAction();
  const runtime = createQuickActionHotkeyRuntime({
    getActions: async () => [createQuickAction()],
    triggerQuickAction,
  });
  const input = document.createElement('input');
  document.body.append(input);

  runtime.start();
  await flushAsyncWork();
  input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, key: 'k' }));
  trustedEventMocks.isTrustedKeyboardEvent.mockReturnValue(false);
  window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: 'k' }));
  await flushAsyncWork();
  runtime.stop();

  expect(triggerQuickAction).not.toHaveBeenCalled();
  input.remove();
});

it('uses the content-owned composed path fallback for editable targets', async () => {
  const triggerQuickAction = createTriggerQuickAction();
  const runtime = createQuickActionHotkeyRuntime({
    getActions: async () => [createQuickAction()],
    triggerQuickAction,
  });
  const textarea = document.createElement('textarea');
  const event = new KeyboardEvent('keydown', { ctrlKey: true, key: 'k' });
  Object.defineProperty(event, 'composedPath', { value: () => [textarea] });

  runtime.start();
  await flushAsyncWork();
  window.dispatchEvent(event);
  await flushAsyncWork();
  runtime.stop();

  expect(triggerQuickAction).not.toHaveBeenCalled();
});

it('ignores disabled actions and throttles repeated triggers', async () => {
  const triggerQuickAction = createTriggerQuickAction();
  let now = 2000;
  const runtime = createQuickActionHotkeyRuntime({
    getActions: async () => [
      createQuickAction({ id: 'disabled-action', status: false }),
      createQuickAction({ id: 'enabled-action' }),
    ],
    now: () => now,
    triggerQuickAction,
  });

  runtime.start();
  await flushAsyncWork();
  window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: 'k' }));
  now = 2500;
  window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: 'k' }));
  now = 3100;
  window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: 'k' }));
  await flushAsyncWork();
  runtime.stop();

  expect(triggerQuickAction).toHaveBeenCalledTimes(2);
  expect(triggerQuickAction).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ id: 'enabled-action' }),
    expect.any(KeyboardEvent)
  );
  expect(triggerQuickAction).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ id: 'enabled-action' }),
    expect.any(KeyboardEvent)
  );
});

it('refreshes actions after quick-action storage changes', async () => {
  const triggerQuickAction = createTriggerQuickAction();
  const storageListenerRef: { current: BrowserStorageChangeListener | null } = { current: null };
  const runtime = createQuickActionHotkeyRuntime({
    getActions: vi
      .fn()
      .mockResolvedValueOnce([createQuickAction()])
      .mockResolvedValueOnce([
        createQuickAction({
          hotkey: {
            altKey: false,
            ctrlKey: false,
            key: 'x',
            metaKey: false,
            shiftKey: true,
          },
          id: 'refreshed-action',
        }),
      ]),
    triggerQuickAction,
    storage: {
      canObserveChanges: () => true,
      subscribeToChanges: (listener) => {
        storageListenerRef.current = listener;
        return () => undefined;
      },
    } as typeof import('../../../composition/persistence/infrastructure/browser-storage').browserStorage,
  });

  runtime.start();
  await flushAsyncWork();
  if (!storageListenerRef.current) {
    throw new Error('Expected storage listener to be registered');
  }
  storageListenerRef.current({ sniptale_quick_actions: { newValue: [], oldValue: [] } }, 'local');
  await flushAsyncWork();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', shiftKey: true }));
  await flushAsyncWork();
  runtime.stop();

  expect(triggerQuickAction).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'refreshed-action' }),
    expect.any(KeyboardEvent)
  );
});
