// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  persistSettings: vi.fn(),
  persistUiState: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../recording/persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../recording/persistence')>()),
  persistVideoSettings: mocks.persistSettings,
  persistVideoUiState: mocks.persistUiState,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: { error: mocks.toastError },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.persistSettings.mockImplementation(async (patch: Partial<VideoRecordingSettings>) => ({
    ...DEFAULT_VIDEO_SETTINGS,
    ...patch,
  }));
  mocks.persistUiState.mockResolvedValue(undefined);
});

it('treats bootstrap values as the baseline and persists later Video edits', async () => {
  const { usePopupVideoPersistenceEffects } = await import('./video-persistence-effects');
  let setReady!: (ready: boolean) => void;
  let setSettings!: React.Dispatch<React.SetStateAction<VideoRecordingSettings>>;
  function Harness() {
    const [isReady, updateReady] = useState(false);
    const [videoSettings, updateSettings] = useState(DEFAULT_VIDEO_SETTINGS);
    const [videoCaptureMode, setVideoCaptureMode] = useState<CaptureMode>(CaptureMode.TAB);
    const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
    setReady = updateReady;
    setSettings = updateSettings;
    usePopupVideoPersistenceEffects({
      isReady,
      selectedPresetId,
      setSelectedPresetId,
      setVideoCaptureMode,
      setVideoSettings: updateSettings,
      videoCaptureMode,
      videoSettings,
    });
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Harness />));
  act(() => setSettings((current) => ({ ...current, countdownSeconds: 1 })));
  act(() => setReady(true));
  await act(async () => Promise.resolve());
  expect(mocks.persistSettings).not.toHaveBeenCalled();

  act(() => setSettings((current) => ({ ...current, countdownSeconds: 2 })));
  await vi.waitFor(() => expect(mocks.persistSettings).toHaveBeenCalledOnce());
  act(() => root.unmount());
});

it('surfaces a failed Video settings write', async () => {
  mocks.persistSettings.mockRejectedValueOnce(new Error('storage failed'));
  const { usePopupVideoPersistenceEffects } = await import('./video-persistence-effects');
  let changeSettings!: () => void;
  function Harness() {
    const [videoSettings, setVideoSettings] = useState(DEFAULT_VIDEO_SETTINGS);
    changeSettings = () => setVideoSettings((current) => ({ ...current, countdownSeconds: 2 }));
    const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
    const [videoCaptureMode, setVideoCaptureMode] = useState<CaptureMode>(CaptureMode.TAB);
    usePopupVideoPersistenceEffects({
      isReady: true,
      selectedPresetId,
      setSelectedPresetId,
      setVideoCaptureMode,
      setVideoSettings,
      videoCaptureMode,
      videoSettings,
    });
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Harness />));
  act(() => changeSettings());
  await vi.waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
  act(() => root.unmount());
});
