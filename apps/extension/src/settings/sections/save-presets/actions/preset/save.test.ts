import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
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
    error: mocks.toastErrorMock,
    success: mocks.toastSuccessMock,
  },
}));

import { createSavePresetAction } from './save';
import { createSettings } from './test-support';
import type { SavePreset } from '../../../../../contracts/settings';
import type { SavePresetsDialogState, SavePresetsSyncState } from '../../state/types';

function createPreset(id: string, order: number, overrides: Partial<SavePreset> = {}): SavePreset {
  return {
    id,
    name: `Preset ${id}`,
    path: `Folder/${id}`,
    enabled: true,
    order,
    ...overrides,
  };
}

function createSyncState(presets: SavePreset[]): SavePresetsSyncState {
  const sync = {
    captureAction: 'download_default' as const,
    defaultExportPresetId: null,
    defaultImagePresetId: null,
    defaultVideoPresetId: null,
    isLoading: false,
    presets,
    saveCapturesToGallery: false,
    settings: createSettings(),
    setCaptureAction: vi.fn(),
    setDefaultExportPresetId: vi.fn(),
    setDefaultImagePresetId: vi.fn(),
    setDefaultVideoPresetId: vi.fn(),
    setPresets: vi.fn((value: SavePreset[]) => {
      sync.presets = value;
    }),
    setSaveCapturesToGallery: vi.fn(),
    updateSettings: vi.fn(async () => undefined),
  };
  return sync;
}

beforeEach(() => {
  mocks.toastErrorMock.mockReset();
  mocks.toastSuccessMock.mockReset();
  mocks.translateMock.mockClear();
});

it('creates a new preset with sanitized path and closes the editor', async () => {
  const sync = createSyncState([createPreset('a', 0), createPreset('b', 1)]);
  const dialogState: SavePresetsDialogState = {
    closeDeleteDialog: vi.fn(),
    closeEditor: vi.fn(),
    confirmDelete: null,
  };
  const persistSettings = vi.fn(async () => undefined);
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('11111111-1111-1111-1111-111111111111');

  await createSavePresetAction(sync, dialogState, persistSettings)(
    '  New preset  ',
    '../Shots',
    true
  );

  expect(sync.presets.at(-1)).toEqual({
    id: '11111111-1111-1111-1111-111111111111',
    enabled: true,
    name: 'New preset',
    order: 2,
    path: 'Shots',
  });
  expect(persistSettings).toHaveBeenCalledWith({ presets: sync.presets });
  expect(dialogState.closeEditor).toHaveBeenCalledTimes(1);
  expect(mocks.toastSuccessMock).toHaveBeenCalledWith('savePresets.messages.presetCreated');
});

it('updates an existing preset and keeps its previous path when sanitized input is empty', async () => {
  const editingPreset = createPreset('a', 0, { path: 'Existing' });
  const sync = createSyncState([editingPreset, createPreset('b', 1)]);
  const dialogState: SavePresetsDialogState = {
    closeDeleteDialog: vi.fn(),
    closeEditor: vi.fn(),
    confirmDelete: null,
    editingPreset,
  };
  const persistSettings = vi.fn(async () => undefined);

  await createSavePresetAction(sync, dialogState, persistSettings)(' Renamed ', '../', false);

  expect(sync.presets[0]).toEqual({
    ...editingPreset,
    enabled: false,
    name: 'Renamed',
    path: 'Existing',
  });
  expect(dialogState.closeEditor).toHaveBeenCalledTimes(1);
  expect(mocks.toastSuccessMock).toHaveBeenCalledWith('savePresets.messages.presetUpdated');
});

it('rejects blank names before persisting settings', async () => {
  const sync = createSyncState([createPreset('a', 0)]);
  const dialogState: SavePresetsDialogState = {
    closeDeleteDialog: vi.fn(),
    closeEditor: vi.fn(),
    confirmDelete: null,
  };
  const persistSettings = vi.fn(async () => undefined);

  await createSavePresetAction(sync, dialogState, persistSettings)('   ', 'ignored', true);

  expect(sync.setPresets).not.toHaveBeenCalled();
  expect(persistSettings).not.toHaveBeenCalled();
  expect(dialogState.closeEditor).not.toHaveBeenCalled();
  expect(mocks.toastErrorMock).toHaveBeenCalledWith('savePresets.messages.nameRequired');
});
