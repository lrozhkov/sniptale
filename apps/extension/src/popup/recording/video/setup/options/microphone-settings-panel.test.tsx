// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { MicrophoneSettingsPanel } from './microphone-settings-panel';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => {
    if (key === 'popup.video.microphoneSettingsActual') {
      return 'Now: {settings}';
    }
    if (key === 'popup.video.microphoneActualSampleRate') {
      return '{value} kHz';
    }
    if (key === 'popup.video.microphoneActualChannelOne') {
      return '1 channel';
    }
    if (key === 'popup.video.microphoneActualEnabled') {
      return '{label}: on';
    }
    if (key === 'popup.video.microphoneActualDisabled') {
      return '{label}: off';
    }
    return key;
  },
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

class FakeAudioTrack {
  enabled = true;
  stop = vi.fn();
  applyConstraints = vi.fn().mockResolvedValue(undefined);

  getCapabilities() {
    return {
      autoGainControl: [true, false],
      echoCancellation: [false],
    } as MediaTrackCapabilities;
  }

  getSettings() {
    return {
      autoGainControl: true,
      channelCount: 1,
      echoCancellation: false,
      sampleRate: 48000,
    } as MediaTrackSettings;
  }
}

class FakeStream {
  constructor(readonly track = new FakeAudioTrack()) {}

  getAudioTracks() {
    return [this.track];
  }

  getTracks() {
    return [this.track];
  }
}

function createSettings(): VideoRecordingSettings {
  return {
    autoFadeDelay: 3,
    autoGainControl: true,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    echoCancellation: true,
    microphoneDeviceId: 'mic-1',
    microphoneEnabled: true,
    microphoneGain: 1,
    noiseSuppression: true,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: false,
    webcamDeviceId: null,
    webcamEnabled: false,
  };
}

function installAudioContextMock() {
  const analyser = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    fftSize: 256,
    getFloatTimeDomainData: vi.fn((samples: Float32Array) => samples.fill(0.25)),
  };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const AudioContextMock = vi.fn(function MockAudioContext() {
    return {
      close: vi.fn().mockResolvedValue(undefined),
      createAnalyser: vi.fn(() => analyser),
      createMediaStreamSource: vi.fn(() => source),
      state: 'running',
    };
  });
  vi.stubGlobal('AudioContext', AudioContextMock);
  let frameCalled = false;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      if (!frameCalled) {
        frameCalled = true;
        callback(1);
      }
      return 1;
    })
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
}

async function renderPanel(onSettingsChange = vi.fn(), stream = new FakeStream()) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue(stream),
    },
  });

  await act(async () => {
    root?.render(
      <MicrophoneSettingsPanel
        currentDeviceId="mic-1"
        currentDeviceLabel="Studio mic"
        settings={createSettings()}
        onSettingsChange={onSettingsChange}
      />
    );
    await Promise.resolve();
  });
  return { onSettingsChange, stream };
}

async function rerenderPanel(settings: VideoRecordingSettings, onSettingsChange = vi.fn()) {
  await act(async () => {
    root?.render(
      <MicrophoneSettingsPanel
        currentDeviceId="mic-1"
        currentDeviceLabel="Studio mic"
        settings={settings}
        onSettingsChange={onSettingsChange}
      />
    );
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  installAudioContextMock();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders actual microphone settings, level meter, and capability statuses', async () => {
  await renderPanel();

  expect(container?.textContent).toContain('popup.video.microphoneSettingsTitle');
  expect(container?.textContent).toContain('Studio mic');
  expect(container?.textContent).toContain('popup.video.microphoneStatusUnsupported');
  expect(container?.textContent).toContain('popup.video.microphoneStatusUnknown');
  expect(container?.textContent).toContain('Now: 48 kHz, 1 channel');
  expect(container?.textContent).not.toContain('sampleRate');
});

it('does not commit settings when applyConstraints fails', async () => {
  const stream = new FakeStream();
  stream.track.applyConstraints.mockRejectedValueOnce(new Error('denied'));
  const { onSettingsChange } = await renderPanel(vi.fn(), stream);

  await act(async () => {
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .find((button) => button.textContent?.includes('popup.video.microphoneNoiseSuppression'))
      ?.click();
    await Promise.resolve();
  });

  expect(onSettingsChange).not.toHaveBeenCalled();
  expect(container?.textContent).toContain('popup.video.microphoneStatusError');
});

it('patches the recording microphone gain from the settings slider', async () => {
  const { onSettingsChange } = await renderPanel();

  act(() => {
    const slider = container?.querySelector<HTMLInputElement>('input[type="range"]');
    if (!slider) {
      throw new Error('Expected microphone gain slider.');
    }
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(slider, '150');
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });

  expect(onSettingsChange).toHaveBeenCalledWith({ microphoneGain: 1.5 });
});

it('stops the microphone probe stream when the panel closes', async () => {
  const stream = new FakeStream();
  await renderPanel(vi.fn(), stream);

  act(() => root?.unmount());
  root = null;

  expect(stream.track.stop).toHaveBeenCalledOnce();
});

it('does not reopen the probe stream for software gain updates', async () => {
  const stream = new FakeStream();
  await renderPanel(vi.fn(), stream);

  await rerenderPanel({ ...createSettings(), microphoneGain: 1.5 });

  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
  expect(stream.track.stop).not.toHaveBeenCalled();
});

it('reopens the probe stream when browser audio constraints change', async () => {
  const stream = new FakeStream();
  await renderPanel(vi.fn(), stream);

  await rerenderPanel({ ...createSettings(), echoCancellation: false });

  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
  expect(stream.track.stop).toHaveBeenCalledOnce();
});
