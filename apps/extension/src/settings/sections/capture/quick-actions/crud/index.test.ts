import { beforeEach, expect, it, vi } from 'vitest';

const persistenceMocks = vi.hoisted(() => ({
  saveQuickActions: vi.fn(),
}));

vi.mock('../../../../../composition/persistence/quick-actions', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../composition/persistence/quick-actions')
  >()),
  saveQuickActions: persistenceMocks.saveQuickActions,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  toast: { error: vi.fn() },
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import type { QuickAction } from '../../../../../contracts/settings';
import { createQuickActionsCrud } from '.';

function createQuickAction(overrides: Partial<QuickAction> = {}): QuickAction {
  return {
    afterCapture: 'download_default',
    bundledId: null,
    delay: null,
    viewportPresetId: 'native',
    exitAfterCapture: false,
    hotkey: null,
    icon: 'Camera',
    id: 'action-1',
    imageFormat: null,
    imageQuality: null,
    name: 'Action',
    origin: 'user',
    screenshotMode: 'visible',
    status: true,
    ...overrides,
  };
}

beforeEach(() => {
  persistenceMocks.saveQuickActions.mockReset();
  persistenceMocks.saveQuickActions.mockResolvedValue(undefined);
});

it('owns the complete quick-action mutation transaction', async () => {
  const action = createQuickAction();
  const editForm = createQuickAction({ name: 'Updated action' });
  const resetEditor = vi.fn();
  const setActions = vi.fn();
  const setEditingId = vi.fn();
  const setEditForm = vi.fn();
  const showConfirmation = vi.fn();
  const crud = createQuickActionsCrud({
    actions: [action],
    editForm,
    resetEditor,
    setActions,
    setEditingId,
    setEditForm,
    showConfirmation,
  });

  crud.handleAdd();
  crud.handleCancelEdit();
  crud.handleEdit(action);
  crud.updateFormField('name', 'Renamed action');
  await crud.handleSaveEdit();
  await crud.handleToggleStatus(action.id);
  await crud.handleDelete(action.id);

  expect(setEditingId).toHaveBeenCalledWith(action.id);
  expect(setEditForm).toHaveBeenCalledWith(expect.objectContaining({ name: 'Renamed action' }));
  expect(persistenceMocks.saveQuickActions).toHaveBeenNthCalledWith(1, [editForm]);
  expect(persistenceMocks.saveQuickActions).toHaveBeenNthCalledWith(2, [
    expect.objectContaining({ id: action.id, status: false }),
  ]);
  expect(persistenceMocks.saveQuickActions).toHaveBeenNthCalledWith(3, []);
  expect(setActions).toHaveBeenCalledTimes(3);
  expect(showConfirmation).toHaveBeenCalledTimes(2);
  expect(resetEditor).toHaveBeenCalledTimes(2);
});
