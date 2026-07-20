import { beforeEach, expect, it, vi } from 'vitest';

import { createDropPresetAction } from './drop';
import { createSettings } from './test-support';
import type { SavePreset } from '../../../../../contracts/settings';
import type { SavePresetsDragState, SavePresetsSyncState } from '../../state/types';

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
    defaultExportPresetId: null,
    defaultImagePresetId: null,
    defaultVideoPresetId: null,
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

function createDragState(draggedId: string | null): SavePresetsDragState {
  return {
    draggedId,
    setDraggedId: vi.fn(),
    setDragOverId: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('reorders presets when the drop target is valid', async () => {
  const sync = createSyncState();
  const dragState = createDragState('a');
  const persistSettings = vi.fn(async () => undefined);

  await createDropPresetAction(sync, dragState, persistSettings)('b');

  expect(sync.setPresets).toHaveBeenCalledWith([createPreset('b', 0), createPreset('a', 1)]);
  expect(persistSettings).toHaveBeenCalledWith({
    presets: [createPreset('b', 0), createPreset('a', 1)],
  });
  expect(dragState.setDraggedId).toHaveBeenCalledWith(null);
  expect(dragState.setDragOverId).toHaveBeenCalledWith(null);
});

it('resets drag state without persisting when the drop is ignored', async () => {
  const sync = createSyncState();
  const dragState = createDragState(null);
  const persistSettings = vi.fn(async () => undefined);

  await createDropPresetAction(sync, dragState, persistSettings)('b');

  expect(sync.setPresets).not.toHaveBeenCalled();
  expect(persistSettings).not.toHaveBeenCalled();
  expect(dragState.setDraggedId).toHaveBeenCalledWith(null);
  expect(dragState.setDragOverId).toHaveBeenCalledWith(null);
});

it('drops back to idle when the reorder target does not exist', async () => {
  const sync = createSyncState();
  const dragState = createDragState('a');
  const persistSettings = vi.fn(async () => undefined);

  await createDropPresetAction(sync, dragState, persistSettings)('missing');

  expect(sync.setPresets).not.toHaveBeenCalled();
  expect(persistSettings).not.toHaveBeenCalled();
  expect(dragState.setDraggedId).toHaveBeenCalledWith(null);
  expect(dragState.setDragOverId).toHaveBeenCalledWith(null);
});
