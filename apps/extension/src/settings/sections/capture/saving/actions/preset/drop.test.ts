import { expect, it, vi } from 'vitest';

import type { SavePreset } from '../../../../../../contracts/settings';
import type { SavePresetsSyncState } from '../../state/types';
import { createMovePresetBeforeAction } from './drop';
import { createSettings } from './test-support';

function createPreset(id: string, order: number): SavePreset {
  return { id, name: `Preset ${id}`, path: `Folder/${id}`, enabled: true, order };
}

function createSyncState(): SavePresetsSyncState {
  return {
    captureAction: 'download_default',
    defaultExportPresetId: null,
    defaultImagePresetId: null,
    defaultVideoPresetId: null,
    isLoading: false,
    presets: [createPreset('a', 0), createPreset('b', 1)],
    settings: createSettings(),
    setCaptureAction: vi.fn(),
    setDefaultExportPresetId: vi.fn(),
    setDefaultImagePresetId: vi.fn(),
    setDefaultVideoPresetId: vi.fn(),
    setPresets: vi.fn(),
    updateSettings: vi.fn(async () => undefined),
  };
}

it('persists the canonical insertion intent', async () => {
  const sync = createSyncState();
  const persistSettings = vi.fn(async () => undefined);

  await createMovePresetBeforeAction(sync, persistSettings)('a', null);

  const reordered = [createPreset('b', 0), createPreset('a', 1)];
  expect(sync.setPresets).toHaveBeenCalledWith(reordered);
  expect(persistSettings).toHaveBeenCalledWith({ presets: reordered });
});

it('ignores invalid anchors and rolls optimistic state back after persistence failure', async () => {
  const sync = createSyncState();
  const persistSettings = vi.fn(async () => {
    throw new Error('save failed');
  });

  await createMovePresetBeforeAction(sync, persistSettings)('a', 'missing');
  expect(sync.setPresets).not.toHaveBeenCalled();

  await expect(createMovePresetBeforeAction(sync, persistSettings)('a', null)).rejects.toThrow(
    'save failed'
  );
  expect(sync.setPresets).toHaveBeenLastCalledWith(sync.presets);
});
