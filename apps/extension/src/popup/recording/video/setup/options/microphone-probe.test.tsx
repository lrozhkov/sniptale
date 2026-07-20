// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { useMicrophoneProbe } from './microphone-probe';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

class FakeAudioTrack {
  stop = vi.fn();
  getCapabilities() {
    return { echoCancellation: [true, false] } as MediaTrackCapabilities;
  }
  getSettings() {
    return { echoCancellation: true, sampleRate: 48000 } as MediaTrackSettings;
  }
}

class FakeStream {
  constructor(private readonly track = new FakeAudioTrack()) {}
  getAudioTracks() {
    return [this.track];
  }
  getTracks() {
    return [this.track];
  }
}

function createSettings(overrides: Partial<VideoRecordingSettings> = {}): VideoRecordingSettings {
  return {
    autoFadeDelay: 0,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneDeviceId: 'mic-1',
    microphoneEnabled: true,
    microphoneGain: 1,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: false,
    webcamDeviceId: null,
    webcamEnabled: false,
    ...overrides,
  };
}

function ProbeView({
  currentDeviceId,
  settings,
}: {
  currentDeviceId: string | null;
  settings: VideoRecordingSettings;
}) {
  const probe = useMicrophoneProbe({ currentDeviceId, settings });
  return (
    <div data-status={probe.status}>
      {probe.status === 'ready' ? probe.settings.sampleRate : ''}
    </div>
  );
}

async function renderProbe({
  currentDeviceId = 'mic-1',
  settings = createSettings(),
}: {
  currentDeviceId?: string | null;
  settings?: VideoRecordingSettings;
}) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<ProbeView currentDeviceId={currentDeviceId} settings={settings} />);
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue(new FakeStream()),
    },
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('stays idle without a selected microphone device', async () => {
  await renderProbe({ currentDeviceId: null });

  expect(container?.querySelector('[data-status="idle"]')).not.toBeNull();
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
});

it('opens a probe stream with only defined audio processing constraints', async () => {
  await renderProbe({
    settings: createSettings({ echoCancellation: false }),
  });

  expect(container?.querySelector('[data-status="ready"]')?.textContent).toBe('48000');
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
    audio: {
      autoGainControl: true,
      deviceId: { exact: 'mic-1' },
      echoCancellation: false,
      noiseSuppression: true,
      sampleRate: 48000,
    },
    video: false,
  });
});

it('surfaces probe errors without keeping a stream active', async () => {
  vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new Error('denied'));

  await renderProbe({});

  expect(container?.querySelector('[data-status="error"]')).not.toBeNull();
});
