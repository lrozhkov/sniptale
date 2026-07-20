import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: {
    error: vi.fn(),
  },
}));

import type { QuickAction } from '../../../../contracts/settings';
import {
  beginEditQuickAction,
  beginNewQuickAction,
  deleteQuickAction,
  saveEditedQuickAction,
  updateQuickActionField,
} from './editing';

function createQuickAction(overrides: Partial<QuickAction> = {}): QuickAction {
  return {
    afterCapture: overrides.afterCapture ?? 'download_default',
    bundledId: overrides.bundledId ?? null,
    delay: overrides.delay ?? null,
    emulation: overrides.emulation ?? 'native',
    exitAfterCapture: overrides.exitAfterCapture ?? false,
    hotkey: overrides.hotkey ?? null,
    icon: overrides.icon ?? 'Camera',
    id: overrides.id ?? 'action-1',
    imageFormat: overrides.imageFormat ?? null,
    imageQuality: overrides.imageQuality ?? null,
    name: overrides.name ?? 'Action',
    origin: overrides.origin ?? 'user',
    screenshotMode: overrides.screenshotMode ?? 'visible',
    status: overrides.status ?? true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('starts editing and skips bundled actions', () => {
  const setEditingId = vi.fn();
  const setEditForm = vi.fn();
  const bundled = createQuickAction({
    bundledId: 'default-selection',
    origin: 'bundled',
  });
  const existing = createQuickAction({ id: 'action-2', name: 'Existing' });

  beginNewQuickAction(setEditingId, setEditForm);
  beginEditQuickAction(bundled, setEditingId, setEditForm);
  beginEditQuickAction(existing, setEditingId, setEditForm);
  updateQuickActionField(existing, 'name', 'Updated', setEditForm);
  updateQuickActionField(null, 'name', 'Ignored', setEditForm);

  expect(setEditingId).toHaveBeenCalledTimes(2);
  expect(setEditForm).toHaveBeenCalledWith(expect.objectContaining({ name: '' }));
  expect(setEditForm).toHaveBeenCalledWith(existing);
  expect(setEditForm).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Updated' }));
});

it('saves created and edited actions and rejects invalid input', async () => {
  const onConfirm = vi.fn();
  const onPersist = vi.fn().mockResolvedValue(true);
  const onResetEditor = vi.fn();

  await saveEditedQuickAction({
    actions: [createQuickAction({ id: 'existing', name: 'Old' })],
    editForm: createQuickAction({ id: 'existing', name: 'New' }),
    onConfirm,
    onPersist,
    onResetEditor,
  });
  await saveEditedQuickAction({
    actions: [],
    editForm: createQuickAction({ id: 'created', name: 'Created' }),
    onConfirm,
    onPersist,
    onResetEditor,
  });
  await saveEditedQuickAction({
    actions: [],
    editForm: createQuickAction({
      id: 'bundled',
      bundledId: 'default-selection',
      origin: 'bundled',
    }),
    onConfirm,
    onPersist,
    onResetEditor,
  });
  await saveEditedQuickAction({
    actions: [],
    editForm: createQuickAction({ id: 'invalid', name: '   ' }),
    onConfirm,
    onPersist,
    onResetEditor,
  });

  expect(onConfirm).toHaveBeenCalledWith('settings.quickActions.messageUpdated');
  expect(onConfirm).toHaveBeenCalledWith('settings.quickActions.messageCreated');
  expect(onPersist).toHaveBeenCalledWith([
    expect.objectContaining({ id: 'existing', name: 'New' }),
  ]);
  expect(onPersist).toHaveBeenCalledWith([
    expect.objectContaining({ id: 'created', name: 'Created' }),
  ]);
  expect(onResetEditor).toHaveBeenCalledTimes(3);
});

it('deletes user actions only', async () => {
  const onConfirm = vi.fn();
  const onPersist = vi.fn().mockResolvedValue(true);
  const user = createQuickAction({ id: 'user-1' });
  const bundled = createQuickAction({
    id: 'bundled-1',
    bundledId: 'default-selection',
    origin: 'bundled',
  });

  await deleteQuickAction([user], 'user-1', onPersist, onConfirm);
  await deleteQuickAction([bundled], 'bundled-1', onPersist, onConfirm);

  expect(onPersist).toHaveBeenCalledWith([]);
  expect(onConfirm).toHaveBeenCalledWith('settings.quickActions.messageDeleted');
});

it('skips success side effects when persistence reports failure', async () => {
  const onConfirm = vi.fn();
  const onPersist = vi.fn().mockResolvedValue(false);
  const onResetEditor = vi.fn();

  await saveEditedQuickAction({
    actions: [],
    editForm: createQuickAction({ id: 'created', name: 'Created' }),
    onConfirm,
    onPersist,
    onResetEditor,
  });

  expect(onPersist).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
  expect(onResetEditor).not.toHaveBeenCalled();
});
