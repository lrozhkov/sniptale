import { describe, expect, it, vi } from 'vitest';

import type { SavePreset } from '../../../../../contracts/settings';
import {
  createDefaultPresetHandlers,
  createSavePresetsMutators,
  createSavePresetsState,
  shouldConfirmDelete,
} from '.';
import { getCaptureActionOptions, isPresetUsed, reorderPresetsBefore } from './helpers';
import type { SavePresetsActions, SavePresetsDialogsState, SavePresetsSyncState } from './types';

function createPreset(id: string): SavePreset {
  return {
    enabled: true,
    id,
    name: `Preset ${id}`,
    order: 0,
    path: `Folder/${id}`,
  };
}

function createSyncState(): SavePresetsSyncState {
  return {
    captureAction: 'download_default',
    defaultExportPresetId: 'export',
    defaultImagePresetId: 'image',
    defaultVideoPresetId: 'video',
    isLoading: false,
    presets: [createPreset('image')],
    setCaptureAction: vi.fn(),
    setDefaultExportPresetId: vi.fn(),
    setDefaultImagePresetId: vi.fn(),
    setDefaultVideoPresetId: vi.fn(),
    setPresets: vi.fn(),
    settings: {} as SavePresetsSyncState['settings'],
    updateSettings: vi.fn(async () => undefined),
  };
}

function createDialogState(): SavePresetsDialogsState {
  return {
    closeDeleteDialog: vi.fn(),
    closeEditor: vi.fn(),
    confirmDelete: createPreset('delete'),
    editingPreset: createPreset('edit'),
    isEditorOpen: true,
    openEditor: vi.fn(),
    setConfirmDelete: vi.fn(),
    setEditingPreset: vi.fn(),
    setIsEditorOpen: vi.fn(),
  };
}

function createActions(): SavePresetsActions {
  return {
    confirmDeletePreset: vi.fn(async () => undefined),
    handleCaptureActionChange: vi.fn(async () => undefined),
    handleDefaultPresetChange: vi.fn(async () => undefined),
    handleDeletePreset: vi.fn(),
    handleMoveBefore: vi.fn(async () => undefined),
    handleSavePreset: vi.fn(async () => undefined),
    handleTogglePresetEnabled: vi.fn(async () => undefined),
  };
}

describe('save-presets section state helpers', () => {
  it('includes the explicit save-to-library after-capture action', () => {
    expect(getCaptureActionOptions()).toContainEqual(
      expect.objectContaining({ value: 'save_to_library' })
    );
  });
  it('detects assigned presets and reorders valid targets', () => {
    const presets = [createPreset('a'), createPreset('b'), createPreset('c')];
    expect(isPresetUsed('a', 'a', null, null)).toBe(true);
    expect(isPresetUsed('b', null, 'b', null)).toBe(true);
    expect(isPresetUsed('c', null, null, 'c')).toBe(true);
    expect(isPresetUsed('none', 'a', 'b', 'c')).toBe(false);
    expect(reorderPresetsBefore(presets, 'c', 'a')?.map(({ id }) => id)).toEqual(['c', 'a', 'b']);
    expect(reorderPresetsBefore(presets, 'a', null)?.map(({ id }) => id)).toEqual(['b', 'c', 'a']);
    expect(reorderPresetsBefore(presets, 'missing', 'a')).toBeNull();
    expect(reorderPresetsBefore(presets, 'a', 'missing')).toBeNull();
  });
  it('returns confirmation only for presets that are not currently assigned as defaults', () => {
    const sync = createSyncState();

    expect(shouldConfirmDelete(createPreset('unused'), sync)).toBe(true);
    expect(shouldConfirmDelete(createPreset('image'), sync)).toBe(false);
    expect(shouldConfirmDelete(createPreset('video'), sync)).toBe(false);
    expect(shouldConfirmDelete(createPreset('export'), sync)).toBe(false);
  });

  it(
    'builds default handlers and controller state from split hook slices',
    verifySplitStateHelpers
  );
});

async function verifySplitStateHelpers(): Promise<void> {
  const sync = createSyncState();
  const dialogState = createDialogState();
  const actions = createActions();
  const viewModel = {
    captureActionOptions: [{ label: 'Default', value: 'download_default' as const }],
    presetOptions: [{ label: 'Preset image', value: 'image' }],
  };

  const handlers = createDefaultPresetHandlers(sync, actions);
  await handlers.handleDefaultImageChange('image-next');

  expect(actions.handleDefaultPresetChange).toHaveBeenCalledWith(
    'defaultImagePresetId',
    'image-next',
    sync.setDefaultImagePresetId,
    'image'
  );
  expectCreatedSavePresetState(sync, dialogState, viewModel);
}

function expectCreatedSavePresetState(
  sync: SavePresetsSyncState,
  dialogState: SavePresetsDialogsState,
  viewModel: Parameters<typeof createSavePresetsState>[2]
): void {
  expect(createSavePresetsState(sync, dialogState, viewModel)).toEqual(
    expect.objectContaining({
      editingPreset: dialogState.editingPreset,
      presets: sync.presets,
    })
  );
  expect(createSavePresetsMutators(dialogState)).toEqual(
    expect.objectContaining({
      closeDeleteDialog: dialogState.closeDeleteDialog,
      openEditor: dialogState.openEditor,
      closeEditor: dialogState.closeEditor,
    })
  );
}
