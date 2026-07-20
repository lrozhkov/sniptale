// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { QuickAction } from '../../../contracts/settings';
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

vi.mock('../../../composition/persistence/quick-actions', async (importOriginal) => ({
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
    emulation: overrides.emulation ?? 'native',
    delay: overrides.delay ?? null,
    afterCapture: overrides.afterCapture ?? 'download_default',
    imageFormat: overrides.imageFormat ?? null,
    imageQuality: overrides.imageQuality ?? null,
    exitAfterCapture: overrides.exitAfterCapture ?? false,
  };
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

async function verifyQuickActionCreateFlow() {
  getQuickActionsMock.mockResolvedValue([]);
  getQuickActionsDisplayModeMock.mockResolvedValue('list');

  await renderHarness();
  await flushEffects();

  expect(latestState?.actions).toEqual([]);

  act(() => {
    latestState?.handleAdd();
  });

  expect(latestState?.editingId).toBe('00000000-0000-4000-8000-000000000001');
  expect(latestState?.editForm?.name).toBe('');

  act(() => {
    latestState?.updateFormField('name', 'Быстрый снимок');
  });

  await act(async () => {
    await latestState?.handleSaveEdit();
  });

  expect(saveQuickActionsMock).toHaveBeenCalledWith([
    expect.objectContaining({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Быстрый снимок',
    }),
  ]);
  expect(latestState?.actions).toEqual([
    expect.objectContaining({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Быстрый снимок',
    }),
  ]);
  expect(latestState?.editingId).toBeNull();
  expect(latestState?.confirmationMessage).toBeTruthy();
}

async function verifyQuickActionUpdateAndDeleteFlow() {
  const existingAction = createQuickAction({ id: 'action-edit', name: 'Старое действие' });

  getQuickActionsMock.mockResolvedValue([existingAction]);
  getQuickActionsDisplayModeMock.mockResolvedValue('list');

  await renderHarness();
  await flushEffects();

  act(() => {
    latestState?.handleEdit(existingAction);
  });

  act(() => {
    latestState?.updateFormField('name', 'Новое действие');
  });

  await act(async () => {
    await latestState?.handleSaveEdit();
  });

  expect(saveQuickActionsMock).toHaveBeenCalledWith([
    expect.objectContaining({ id: 'action-edit', name: 'Новое действие' }),
  ]);
  expect(latestState?.actions[0]?.name).toBe('Новое действие');

  await act(async () => {
    await latestState?.handleDelete('action-edit');
  });

  expect(saveQuickActionsMock).toHaveBeenLastCalledWith([]);
  expect(latestState?.actions).toEqual([]);
}

describe('useQuickActionsController', () => {
  it('creates a new quick action through the settings CRUD flow', verifyQuickActionCreateFlow);
  it('updates and deletes an existing user quick action', verifyQuickActionUpdateAndDeleteFlow);
});
