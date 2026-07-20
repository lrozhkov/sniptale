// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuickAction } from '../../../../contracts/settings';

const storageMocks = vi.hoisted(() => ({
  getQuickActions: vi.fn(),
}));

const browserStorageMocks = vi.hoisted(() => ({
  canObserveChanges: vi.fn(() => false),
  subscribeToChanges: vi.fn(),
}));

const transportMocks = vi.hoisted(() => ({
  sendRuntimeMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ error: vi.fn(), log: vi.fn() }),
}));

vi.mock(
  '../../../../composition/persistence/infrastructure/browser-storage',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/persistence/infrastructure/browser-storage')
    >()),
    browserStorage: browserStorageMocks,
  })
);

vi.mock('../../../../composition/persistence/quick-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/quick-actions')>()),

  getQuickActions: storageMocks.getQuickActions,
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: transportMocks.sendRuntimeMessage,
}));

import { useQuickActionHotkeys } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createQuickAction(): QuickAction {
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
  };
}

function Harness() {
  useQuickActionHotkeys();
  return null;
}

async function renderHarness() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<Harness />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  storageMocks.getQuickActions.mockResolvedValue([createQuickAction()]);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('quick-action hotkey trusted events', () => {
  it('ignores synthetic quick-action hotkeys', async () => {
    await renderHarness();
    await act(async () => {
      await Promise.resolve();
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: 'k' }));

    expect(transportMocks.sendRuntimeMessage).not.toHaveBeenCalled();
  });
});
