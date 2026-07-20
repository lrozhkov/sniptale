// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));

import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import {
  WebcamFrameRatePreset,
  WebcamResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import { VideoWebcamSelector } from './webcam-selector';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function createSettings(overrides: Partial<Parameters<typeof VideoWebcamSelector>[0]['settings']>) {
  return {
    autoFadeDelay: 0,
    countdownSeconds: 3,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    webcamDeviceId: 'cam-1',
    webcamEnabled: true,
    openEditorAfterRecording: false,
    quality: VideoQuality.MEDIUM,
    systemAudioEnabled: true,
    webcamQuality: {
      frameRate: WebcamFrameRatePreset.AUTO,
      resolution: WebcamResolutionPreset.AUTO,
    },
    ...overrides,
  };
}

it('shows webcam loading and empty states through i18n labels', () => {
  renderNode(
    <VideoWebcamSelector
      settings={createSettings({ webcamDeviceId: 'cam-1' })}
      webcamDevices={[]}
      isLoadingWebcams
      onWebcamDeviceChange={() => undefined}
      onSettingsChange={() => undefined}
    />
  );

  expect(container?.textContent).toContain('t:popup.video.webcamLoading');

  renderNode(
    <VideoWebcamSelector
      settings={createSettings({ webcamDeviceId: null })}
      webcamDevices={[]}
      isLoadingWebcams={false}
      onWebcamDeviceChange={() => undefined}
      onSettingsChange={() => undefined}
    />
  );

  expect(container?.textContent).toContain('t:popup.video.webcamEmpty');
});

it('hides the webcam selector until webcam capture is enabled', () => {
  renderNode(
    <VideoWebcamSelector
      settings={createSettings({ webcamDeviceId: null, webcamEnabled: false })}
      webcamDevices={[]}
      isLoadingWebcams={false}
      onWebcamDeviceChange={() => undefined}
      onSettingsChange={() => undefined}
    />
  );

  expect(container?.textContent ?? '').not.toContain('t:popup.video.webcamRowLabel');
});

it('shows the webcam select control and emits selected device changes', async () => {
  const onWebcamDeviceChange = vi.fn();

  renderNode(
    <VideoWebcamSelector
      settings={createSettings({ webcamDeviceId: 'cam-1' })}
      webcamDevices={[{ deviceId: 'cam-2', label: 'USB Camera' }]}
      isLoadingWebcams={false}
      onWebcamDeviceChange={onWebcamDeviceChange}
      onSettingsChange={() => undefined}
    />
  );

  await act(async () => {
    container?.querySelector<HTMLButtonElement>('button')?.click();
  });
  expect(container?.textContent).toContain('USB Camera');

  await act(async () => {
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .find((button) => button.textContent?.includes('USB Camera'))
      ?.click();
  });

  expect(onWebcamDeviceChange).toHaveBeenCalledWith('cam-2');
});

it('shows a separate camera settings action', () => {
  renderNode(
    <VideoWebcamSelector
      settings={createSettings({ webcamDeviceId: 'cam-1' })}
      webcamDevices={[{ deviceId: 'cam-1', label: 'USB Camera' }]}
      isLoadingWebcams={false}
      onWebcamDeviceChange={() => undefined}
      onSettingsChange={() => undefined}
    />
  );

  expect(
    container?.querySelector('[aria-label="t:popup.video.webcamSettingsActionAria"]')
  ).not.toBeNull();
});
