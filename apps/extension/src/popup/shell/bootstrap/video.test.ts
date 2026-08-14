import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  loadVideoSettings: vi.fn(),
  loadVideoUiState: vi.fn(),
  trackPopupPerfAsync: vi.fn((_: string, task: () => Promise<unknown>) => task()),
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: mocks.loadSettings,
}));
vi.mock('../../../composition/persistence/capture-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/capture-settings')>()),
  loadVideoSettings: mocks.loadVideoSettings,
  loadVideoUiState: mocks.loadVideoUiState,
}));
vi.mock('../../diagnostics/performance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../diagnostics/performance')>()),
  trackPopupPerfAsync: mocks.trackPopupPerfAsync,
}));

import { createPopupVideoBootstrapPromises, loadPopupBootstrapVideoData } from './video';

const viewportPresets = [
  {
    kind: 'user' as const,
    id: 'preset-1',
    name: 'Compact',
    target: 'window' as const,
    width: 1280,
    height: 720,
    enabled: true,
    order: 0,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadSettings.mockResolvedValue({ viewportPresets });
  mocks.loadVideoSettings.mockResolvedValue({
    microphoneEnabled: true,
    microphoneDeviceId: 'mic-1',
    webcamEnabled: true,
    webcamDeviceId: 'cam-1',
  });
  mocks.loadVideoUiState.mockResolvedValue({
    captureMode: CaptureMode.TAB,
    viewportPresetId: 'missing-preset',
  });
});

describe('popup-bootstrap video owner', () => {
  it('loads only persisted video state and does not enumerate media devices', async () => {
    const result = await loadPopupBootstrapVideoData(createPopupVideoBootstrapPromises());

    expect(result).toEqual({
      captureMode: CaptureMode.TAB,
      selectedPresetId: null,
      videoSettings: expect.objectContaining({
        microphoneDeviceId: 'mic-1',
        webcamDeviceId: 'cam-1',
      }),
      viewportPresets,
    });
    expect(mocks.trackPopupPerfAsync.mock.calls.map(([label]) => label)).toEqual([
      'popup.bootstrap.settings',
      'popup.bootstrap.video-settings',
      'popup.bootstrap.video-ui-state',
    ]);
  });

  it('restores a valid TAB_CROP viewport preset', async () => {
    mocks.loadVideoUiState.mockResolvedValue({
      captureMode: CaptureMode.TAB_CROP,
      viewportPresetId: 'preset-1',
    });

    const result = await loadPopupBootstrapVideoData(createPopupVideoBootstrapPromises());

    expect(result.captureMode).toBe(CaptureMode.TAB_CROP);
    expect(result.selectedPresetId).toBe('preset-1');
  });

  it('uses an empty viewport list when Settings has no viewport presets', async () => {
    mocks.loadSettings.mockResolvedValue({});

    const result = await loadPopupBootstrapVideoData(createPopupVideoBootstrapPromises());

    expect(result.viewportPresets).toEqual([]);
    expect(result.selectedPresetId).toBeNull();
  });
});
