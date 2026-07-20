import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: mocks.translateMock,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: {
    success: mocks.toastSuccessMock,
  },
}));

import { createConfirmDeletePresetAction } from './confirm-delete';
import { createSettings } from './test-support';
import type { SavePresetsDialogState, SavePresetsSyncState } from '../../state/types';
import type { SavePreset } from '../../../../../contracts/settings';

function createPreset(id: string, order: number): SavePreset {
  return {
    id,
    name: `Preset ${id}`,
    path: `Folder/${id}`,
    enabled: true,
    order,
  };
}

function createSyncState(): SavePresetsSyncState {
  const sync = {
    captureAction: 'download_default' as const,
    defaultExportPresetId: 'b',
    defaultImagePresetId: 'a',
    defaultVideoPresetId: 'b',
    isLoading: false,
    presets: [createPreset('a', 0), createPreset('b', 1)],
    saveCapturesToGallery: false,
    settings: createSettings(),
    setCaptureAction: vi.fn(),
    setDefaultExportPresetId: vi.fn(),
    setDefaultImagePresetId: vi.fn(),
    setDefaultVideoPresetId: vi.fn(),
    setPresets: vi.fn(),
    setSaveCapturesToGallery: vi.fn(),
    updateSettings: vi.fn(async () => undefined),
  };
  return sync;
}

beforeEach(() => {
  mocks.toastSuccessMock.mockReset();
  mocks.translateMock.mockClear();
});

it('deletes the confirmed preset and clears matching default ids', async () => {
  const sync = createSyncState();
  const dialogState: SavePresetsDialogState = {
    closeDeleteDialog: vi.fn(),
    closeEditor: vi.fn(),
    confirmDelete: createPreset('a', 0),
  };
  const persistSettings = vi.fn(async () => undefined);

  await createConfirmDeletePresetAction(sync, dialogState, persistSettings)();

  expect(sync.setPresets).toHaveBeenCalledWith([createPreset('b', 0)]);
  expect(sync.setDefaultImagePresetId).toHaveBeenCalledWith(null);
  expect(sync.setDefaultVideoPresetId).toHaveBeenCalledWith('b');
  expect(sync.setDefaultExportPresetId).toHaveBeenCalledWith('b');
  expect(persistSettings).toHaveBeenCalledWith(
    expect.objectContaining({
      defaultImagePresetId: null,
      presets: [createPreset('b', 0)],
    })
  );
  expect(dialogState.closeDeleteDialog).toHaveBeenCalledTimes(1);
  expect(mocks.toastSuccessMock).toHaveBeenCalledWith('savePresets.messages.presetDeleted');
});

it('returns early when no preset is confirmed for deletion', async () => {
  const sync = createSyncState();
  const dialogState: SavePresetsDialogState = {
    closeDeleteDialog: vi.fn(),
    closeEditor: vi.fn(),
    confirmDelete: null,
  };
  const persistSettings = vi.fn(async () => undefined);

  await createConfirmDeletePresetAction(sync, dialogState, persistSettings)();

  expect(sync.setPresets).not.toHaveBeenCalled();
  expect(persistSettings).not.toHaveBeenCalled();
  expect(dialogState.closeDeleteDialog).not.toHaveBeenCalled();
});
