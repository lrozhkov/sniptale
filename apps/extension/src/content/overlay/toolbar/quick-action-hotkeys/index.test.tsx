// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserStorageChangeListener } from '@sniptale/platform/browser/storage-types';
import type { QuickAction } from '../../../../contracts/settings';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { CONTENT_ACTIVATION_KEY } from './test-support';

const loggerMocks = vi.hoisted(() => ({
  error: vi.fn(),
  log: vi.fn(),
}));
const storageMocks = vi.hoisted(() => ({
  getQuickActions: vi.fn(),
}));
const browserStorageMocks = vi.hoisted(() => ({
  canObserveChanges: vi.fn(() => true),
  subscribeToChanges: vi.fn(),
}));

const transportMocks = vi.hoisted(() => ({
  sendRuntimeMessage: vi.fn().mockResolvedValue(undefined),
}));

const trustedEventMocks = vi.hoisted(() => ({
  isTrustedDomEvent: vi.fn(() => true),
  isTrustedKeyboardEvent: vi.fn(() => true),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal()),
  createLogger: () => loggerMocks,
}));

vi.mock(
  '../../../../composition/persistence/infrastructure/browser-storage',
  async (importOriginal) => ({
    ...(await importOriginal()),
    browserStorage: browserStorageMocks,
  })
);

vi.mock('../../../../composition/persistence/quick-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/quick-actions')>()),
  getQuickActions: storageMocks.getQuickActions,
}));

vi.mock('../../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/trusted-events')>()),
  isTrustedDomEvent: trustedEventMocks.isTrustedDomEvent,
  isTrustedKeyboardEvent: trustedEventMocks.isTrustedKeyboardEvent,
}));

import { useQuickActionHotkeys } from '.';
import { resetContentActionIntentRuntimeForTests } from '../../../application/privileged-action-intent';
import { installContentRuntimeMessagingMock } from '../../../application/runtime-services/services.test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

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

function Harness() {
  useQuickActionHotkeys();
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness />);
  });
}

async function flushRuntimeMessageChain() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function flushAsyncLoad() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  installContentRuntimeMessagingMock(transportMocks.sendRuntimeMessage);
  trustedEventMocks.isTrustedDomEvent.mockReturnValue(true);
  trustedEventMocks.isTrustedKeyboardEvent.mockReturnValue(true);
  transportMocks.sendRuntimeMessage.mockImplementation(async (message: { type?: string }) => {
    if (message.type === MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY) {
      return {
        activationKey: CONTENT_ACTIVATION_KEY,
        success: true,
      };
    }
    if (message.type === MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY) {
      return {
        contentIntent: { requestId: 'content-request-1', token: 'content-token-1' },
        success: true,
      };
    }
    if (message.type === MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN) {
      return { runtimeToken: { runtimeToken: 'content-runtime-token-1' }, success: true };
    }
    if (message.type === MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF) {
      return { success: true, trustedEventProof: { proofToken: 'content-proof-1' } };
    }
    return undefined;
  });
  browserStorageMocks.canObserveChanges.mockReturnValue(true);
  browserStorageMocks.subscribeToChanges.mockReturnValue(() => undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  resetContentActionIntentRuntimeForTests();
  vi.unstubAllGlobals();
});

async function expectLoadedHotkeyActionTriggersRuntimeMessage() {
  storageMocks.getQuickActions.mockResolvedValue([
    createQuickAction(),
    createQuickAction({
      hotkey: null,
      id: 'without-hotkey',
    }),
  ]);

  await renderHarness();
  await flushAsyncLoad();

  const event = new KeyboardEvent('keydown', { ctrlKey: true, key: 'k' });
  window.dispatchEvent(event);
  await flushRuntimeMessageChain();

  expect(transportMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(5, {
    actionId: 'quick-action-1',
    contentIntent: { requestId: 'content-request-1', token: 'content-token-1' },
    type: MessageType.TRIGGER_QUICK_ACTION,
  });
}

async function expectUnmountedHookIgnoresLateQuickActionLoad() {
  let resolveActions: ((actions: QuickAction[]) => void) | null = null;
  storageMocks.getQuickActions.mockReturnValue(
    new Promise<QuickAction[]>((resolve) => {
      resolveActions = resolve;
    })
  );

  await renderHarness();

  act(() => {
    root?.unmount();
  });
  root = null;

  await act(async () => {
    resolveActions?.([createQuickAction()]);
    await Promise.resolve();
  });

  expect(loggerMocks.log).not.toHaveBeenCalledWith('Loaded quick actions with hotkeys', 1);
}

async function expectStorageRefreshReloadsQuickActions() {
  const storageListenerRef = arrangeStorageRefreshQuickActions();

  await renderHarness();
  await flushAsyncLoad();

  if (!storageListenerRef.current) {
    throw new Error('Storage listener was not registered');
  }

  storageListenerRef.current(
    {
      sniptale_quick_actions: {
        newValue: [],
        oldValue: [],
      },
    },
    'local'
  );
  await flushAsyncLoad();

  const event = new KeyboardEvent('keydown', { key: 'x', shiftKey: true });
  window.dispatchEvent(event);
  await flushRuntimeMessageChain();

  expect(transportMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(5, {
    actionId: 'quick-action-2',
    contentIntent: { requestId: 'content-request-1', token: 'content-token-1' },
    type: MessageType.TRIGGER_QUICK_ACTION,
  });
}

async function expectEditableTargetsDoNotTriggerQuickActions() {
  storageMocks.getQuickActions.mockResolvedValue([createQuickAction()]);
  await renderHarness();
  await flushAsyncLoad();

  const input = document.createElement('input');
  document.body.appendChild(input);
  input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, key: 'k' }));

  const textbox = document.createElement('div');
  textbox.setAttribute('role', 'textbox');
  document.body.appendChild(textbox);
  textbox.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, key: 'k' }));

  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  const editable = document.createElement('div');
  editable.setAttribute('contenteditable', 'true');
  shadow.append(editable);
  document.body.appendChild(host);
  editable.dispatchEvent(
    new KeyboardEvent('keydown', {
      bubbles: true,
      composed: true,
      ctrlKey: true,
      key: 'k',
    })
  );

  expect(transportMocks.sendRuntimeMessage).not.toHaveBeenCalled();
}

function arrangeStorageRefreshQuickActions() {
  const storageListenerRef: { current: BrowserStorageChangeListener | null } = { current: null };
  storageMocks.getQuickActions.mockResolvedValueOnce([createQuickAction()]);
  storageMocks.getQuickActions.mockResolvedValueOnce([
    createQuickAction({
      hotkey: {
        altKey: false,
        ctrlKey: false,
        key: 'x',
        metaKey: false,
        shiftKey: true,
      },
      id: 'quick-action-2',
    }),
  ]);
  browserStorageMocks.subscribeToChanges.mockImplementation((listener) => {
    storageListenerRef.current = listener;
    return () => undefined;
  });

  return storageListenerRef;
}

describe('useQuickActionHotkeys', () => {
  it('triggers loaded hotkey', expectLoadedHotkeyActionTriggersRuntimeMessage);
  it('ignores late async loads after unmount', expectUnmountedHookIgnoresLateQuickActionLoad);
  it('refreshes hotkeys after storage changes', expectStorageRefreshReloadsQuickActions);
  it('ignores editable targets', expectEditableTargetsDoNotTriggerQuickActions);
});
