// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { QuickAction } from '../../../../contracts/settings';
import { useQuickActionsController } from './controller';

const {
  getQuickActionsDisplayModeMock,
  getQuickActionsMock,
  loggerErrorMock,
  saveQuickActionsDisplayModeMock,
  saveQuickActionsMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  saveQuickActionsMock: vi.fn(),
  saveQuickActionsDisplayModeMock: vi.fn(),
  getQuickActionsMock: vi.fn(),
  getQuickActionsDisplayModeMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('../../../../composition/persistence/quick-actions', async (importOriginal) => ({
  ...(await importOriginal()),
  getQuickActions: getQuickActionsMock,
  getQuickActionsDisplayMode: getQuickActionsDisplayModeMock,
  saveQuickActions: saveQuickActionsMock,
  saveQuickActionsDisplayMode: saveQuickActionsDisplayModeMock,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: {
    error: toastErrorMock,
  },
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useQuickActionsController> | null = null;

function createQuickAction(overrides: Partial<QuickAction> = {}): QuickAction {
  return {
    id: overrides.id ?? 'action-1',
    status: overrides.status ?? true,
    name: overrides.name ?? 'Снимок страницы',
    icon: overrides.icon ?? 'Camera',
    origin: overrides.origin ?? 'user',
    bundledId: overrides.bundledId ?? null,
    hotkey: overrides.hotkey ?? null,
    screenshotMode: overrides.screenshotMode ?? 'visible',
    viewportPresetId: overrides.viewportPresetId ?? 'native',
    delay: overrides.delay ?? null,
    afterCapture: overrides.afterCapture ?? 'download_default',
    imageFormat: overrides.imageFormat ?? null,
    imageQuality: overrides.imageQuality ?? null,
    exitAfterCapture: overrides.exitAfterCapture ?? false,
  };
}

function createBundledQuickAction(overrides: Partial<QuickAction> = {}): QuickAction {
  return createQuickAction({
    bundledId: 'default-selection',
    origin: 'bundled',
    ...overrides,
  });
}

function ControllerHarness() {
  latestState = useQuickActionsController();
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ControllerHarness />);
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
  saveQuickActionsMock.mockReset();
  saveQuickActionsMock.mockResolvedValue(undefined);
  saveQuickActionsDisplayModeMock.mockReset();
  saveQuickActionsDisplayModeMock.mockResolvedValue(undefined);
  getQuickActionsMock.mockReset();
  getQuickActionsDisplayModeMock.mockReset();
  loggerErrorMock.mockReset();
  toastErrorMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestState = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function loadController(actions: QuickAction[]) {
  getQuickActionsMock.mockResolvedValue(actions);
  getQuickActionsDisplayModeMock.mockResolvedValue('list');
  await renderHarness();
  await flushEffects();
}

it('keeps the controller stable when the initial quick-actions load fails', async () => {
  getQuickActionsMock.mockRejectedValue(new Error('load failed'));
  getQuickActionsDisplayModeMock.mockResolvedValue('list');

  await renderHarness();
  await flushEffects();

  expect(latestState?.isLoading).toBe(false);
  expect(latestState?.actions).toEqual([]);
  expect(loggerErrorMock).toHaveBeenCalledWith('Failed to load quick actions', expect.any(Error));
});

it('persists display-mode and status changes', async () => {
  await loadController([createQuickAction({ id: 'action-1', status: true })]);

  await act(async () => {
    await latestState?.setDisplayMode('hidden');
  });

  expect(saveQuickActionsDisplayModeMock).toHaveBeenCalledWith('hidden');
  expect(latestState?.displayMode).toBe('hidden');
  expect(latestState?.confirmationMessage).toBe('Настройка сохранена');

  await act(async () => {
    await latestState?.handleToggleStatus('action-1');
  });

  expect(saveQuickActionsMock).toHaveBeenLastCalledWith([
    expect.objectContaining({ id: 'action-1', status: false }),
  ]);
  expect(latestState?.actions[0]?.status).toBe(false);
});

it('blocks invalid and bundled quick-action mutations', async () => {
  const bundledAction = createBundledQuickAction({ id: 'bundled-1' });
  await loadController([bundledAction]);

  act(() => {
    latestState?.handleAdd();
  });
  await act(async () => {
    await latestState?.handleSaveEdit();
  });

  expect(toastErrorMock).toHaveBeenCalledWith('Название обязательно');
  expect(saveQuickActionsMock).not.toHaveBeenCalled();

  act(() => {
    latestState?.handleEdit(bundledAction);
  });
  expect(latestState?.editingId).toBe('00000000-0000-4000-8000-000000000001');

  await act(async () => {
    await latestState?.handleDelete('bundled-1');
  });

  expect(saveQuickActionsMock).not.toHaveBeenCalled();
});

it('reorders quick actions and surfaces hotkey errors through the toast seam', async () => {
  const firstAction = createQuickAction({ id: 'action-1', name: 'First' });
  const secondAction = createQuickAction({ id: 'action-2', name: 'Second' });

  await loadController([firstAction, secondAction]);

  await act(async () => {
    await latestState?.handleMoveBefore('action-1', null);
  });

  expect(saveQuickActionsMock).toHaveBeenLastCalledWith([
    expect.objectContaining({ id: 'action-2' }),
    expect.objectContaining({ id: 'action-1' }),
  ]);
  act(() => {
    latestState?.handleHotkeyError('hotkey failed');
  });

  expect(toastErrorMock).toHaveBeenCalledWith('hotkey failed');
});

it('resets editor state through its cancel branch', async () => {
  await loadController([
    createQuickAction({ id: 'action-1', name: 'First' }),
    createQuickAction({ id: 'action-2', name: 'Second' }),
  ]);

  act(() => {
    latestState?.handleAdd();
    latestState?.handleCancelEdit();
  });
  expect(latestState?.editingId).toBeNull();
});
