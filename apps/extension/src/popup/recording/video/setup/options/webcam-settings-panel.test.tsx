// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { createPopupPreviewStream } from './webcam-preview.test-support';
import { WebcamSettingsPanel } from './webcam-settings-panel';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createSettings() {
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    autoFadeDelay: 3,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: false,
    webcamDeviceId: 'cam-1',
    webcamEnabled: true,
  };
}

async function renderPanel(onSettingsChange = vi.fn(), captureMode: CaptureMode = CaptureMode.TAB) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <WebcamSettingsPanel
        captureMode={captureMode}
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

it('shows embedded presentation controls for tab recording', async () => {
  const onSettingsChange = await renderPanel();

  expect(container?.textContent).toContain('popup.video.webcamPresentationEmbedded');
  expect(container?.textContent).toContain('popup.video.webcamPresentationCircle');

  await act(async () => {
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .find((button) => button.textContent?.includes('popup.video.webcamPresentationSeparateTrack'))
      ?.click();
  });

  expect(onSettingsChange).toHaveBeenCalledWith({
    webcamPresentation: expect.objectContaining({ mode: 'separate-track' }),
  });
});

it('does not offer embedded presentation for window capture', async () => {
  await renderPanel(vi.fn(), CaptureMode.SCREEN);

  expect(container?.textContent).not.toContain('popup.video.webcamPresentationEmbedded');
  expect(container?.textContent).not.toContain('popup.video.webcamPresentationShapeLabel');
});
