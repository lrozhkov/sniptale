import { describe, expect, it, vi } from 'vitest';

import type { SavePreset } from '../../../../contracts/settings';
import {
  createDefaultPresetHandlers,
  createSavePresetsMutators,
  createSavePresetsState,
  shouldConfirmDelete,
} from '.';
import type {
  SavePresetsActions,
  SavePresetsDialogsState,
  SavePresetsDragUiState,
  SavePresetsSyncState,
} from './types';

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
    saveCapturesToGallery: true,
    setCaptureAction: vi.fn(),
    setDefaultExportPresetId: vi.fn(),
    setDefaultImagePresetId: vi.fn(),
    setDefaultVideoPresetId: vi.fn(),
    setPresets: vi.fn(),
    setSaveCapturesToGallery: vi.fn(),
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

function createDragState(): SavePresetsDragUiState {
  return {
    dragOverId: 'drag-over',
    draggedId: 'dragged',
    hoveredPresetId: 'hovered',
    setDragOverId: vi.fn(),
    setDraggedId: vi.fn(),
    setHoveredPresetId: vi.fn(),
  };
}

function createActions(): SavePresetsActions {
  return {
    confirmDeletePreset: vi.fn(async () => undefined),
    handleCaptureActionChange: vi.fn(async () => undefined),
    handleDefaultPresetChange: vi.fn(async () => undefined),
    handleDeletePreset: vi.fn(),
    handleDrop: vi.fn(async () => undefined),
    handleSavePreset: vi.fn(async () => undefined),
    handleTogglePresetEnabled: vi.fn(async () => undefined),
    handleToggleSaveToGallery: vi.fn(async () => undefined),
  };
}

describe('save-presets section state helpers', () => {
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
  const dragState = createDragState();
  const actions = createActions();
  const viewModel = {
    captureActionOptions: [{ label: 'Default', value: 'download_default' as const }],
    presetCountLabel: '1 preset',
    presetOptions: [{ label: 'Preset image', value: 'image' }],
  };

  const handlers = createDefaultPresetHandlers(sync, actions);
  await handlers.handleDefaultImageChange('image-next');

  expect(actions.handleDefaultPresetChange).toHaveBeenCalledWith(
    'defaultImagePresetId',
    'image-next',
    sync.setDefaultImagePresetId,
    'image',
    'savePresets.messages.defaultImageUpdated'
  );
  expectCreatedSavePresetState(sync, dragState, dialogState, viewModel);
}

function expectCreatedSavePresetState(
  sync: SavePresetsSyncState,
  dragState: SavePresetsDragUiState,
  dialogState: SavePresetsDialogsState,
  viewModel: Parameters<typeof createSavePresetsState>[3]
): void {
  expect(createSavePresetsState(sync, dragState, dialogState, viewModel)).toEqual(
    expect.objectContaining({
      draggedId: 'dragged',
      editingPreset: dialogState.editingPreset,
      hoveredPresetId: 'hovered',
      presetCountLabel: '1 preset',
      presets: sync.presets,
    })
  );
  expect(createSavePresetsMutators(dragState, dialogState)).toEqual(
    expect.objectContaining({
      closeDeleteDialog: dialogState.closeDeleteDialog,
      openEditor: dialogState.openEditor,
      setHoveredPresetId: dragState.setHoveredPresetId,
    })
  );
}
