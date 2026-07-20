import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
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
  },
}));

import { createDeletePresetGuard } from './delete-guard';
import { createSettings } from './test-support';
import type { SavePreset } from '../../../../../contracts/settings';
import type { SavePresetsSyncState } from '../../state/types';

function createPreset(id: string): SavePreset {
  return {
    id,
    name: `Preset ${id}`,
    path: `Folder/${id}`,
    enabled: true,
    order: 0,
  };
}

function createSyncState(): SavePresetsSyncState {
  return {
    captureAction: 'download_default',
    defaultExportPresetId: 'b',
    defaultImagePresetId: 'a',
    defaultVideoPresetId: 'b',
    isLoading: false,
    presets: [],
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
}

beforeEach(() => {
  mocks.toastErrorMock.mockReset();
  mocks.translateMock.mockClear();
});

it('shows the in-use preset error only for referenced presets', () => {
  const guard = createDeletePresetGuard(createSyncState());

  guard(createPreset('a'));
  guard(createPreset('unused'));

  expect(mocks.toastErrorMock).toHaveBeenCalledTimes(1);
  expect(mocks.toastErrorMock).toHaveBeenCalledWith('savePresets.messages.presetInUseError');
});
