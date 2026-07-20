// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { createPopupPreviewStream } from './webcam-preview.test-support';
import { WebcamSettingsPanel } from './webcam-settings-panel';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createSettings() {
  return {
    autoFadeDelay: 3,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: false,
    webcamDeviceId: 'cam-1',
    webcamEnabled: true,
  };
}

async function renderPanel(onSettingsChange = vi.fn()) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <WebcamSettingsPanel
        currentDeviceId="cam-1"
        settings={createSettings()}
        onSettingsChange={onSettingsChange}
      />
    )
  );
  return onSettingsChange;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue(createPopupPreviewStream()),
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

it('renders camera settings and emits quality changes', async () => {
  const onSettingsChange = await renderPanel();

  expect(container?.textContent).toContain('popup.video.webcamQualityTitle');
  expect(container?.textContent).not.toContain('popup.video.webcamQualityBrowserNotice');

  await act(async () => {
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .find((button) => button.textContent?.includes('720p'))
      ?.click();
  });

  expect(onSettingsChange).toHaveBeenCalledWith({
    webcamQuality: expect.objectContaining({ resolution: '720P' }),
  });
});
