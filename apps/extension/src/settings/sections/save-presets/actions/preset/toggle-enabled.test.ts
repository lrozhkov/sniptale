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

import { createTogglePresetEnabledAction } from './toggle-enabled';
import { createSettings } from './test-support';
import type { SavePreset } from '../../../../../contracts/settings';
import type { SavePresetsSyncState } from '../../state/types';

function createPreset(id: string, enabled: boolean): SavePreset {
  return {
    id,
    name: `Preset ${id}`,
    path: `Folder/${id}`,
    enabled,
    order: 0,
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
  mocks.toastSuccessMock.mockReset();
  mocks.translateMock.mockClear();
});

it('toggles preset enabled state and emits the matching toast copy', async () => {
  const enabledPreset = createPreset('a', true);
  const disabledPreset = createPreset('b', false);
  const sync = createSyncState([enabledPreset, disabledPreset]);
  const persistSettings = vi.fn(async () => undefined);

  await createTogglePresetEnabledAction(sync, persistSettings)(enabledPreset);
  await createTogglePresetEnabledAction(sync, persistSettings)(disabledPreset);

  expect(sync.presets[0]?.enabled).toBe(false);
  expect(sync.presets[1]?.enabled).toBe(true);
  expect(mocks.toastSuccessMock).toHaveBeenCalledWith('savePresets.messages.presetHidden');
  expect(mocks.toastSuccessMock).toHaveBeenCalledWith('savePresets.messages.presetShown');
});
