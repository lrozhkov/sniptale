// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  WebcamFrameRatePreset,
  WebcamPresentationMode,
  WebcamPresentationShape,
  WebcamResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import { createPopupPreviewStream } from './webcam-preview.test-support';
import { WebcamPreview, useWebcamPreview } from './webcam-preview';

vi.mock('../../../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n/popup')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function PreviewProbe({ currentDeviceId }: { currentDeviceId: string | null }) {
  const state = useWebcamPreview({
    currentDeviceId,
    quality: {
      frameRate: WebcamFrameRatePreset.FPS30,
      resolution: WebcamResolutionPreset.P720,
    },
  });

  return (
    <div>
      <span>{state.status}</span>
      <WebcamPreview state={state} />
    </div>
  );
}

async function renderProbe(currentDeviceId: string | null) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<PreviewProbe currentDeviceId={currentDeviceId} />));
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

it('opens and cleans up a selected camera preview stream', async () => {
  const stop = vi.fn();
  const getUserMedia = vi.fn().mockResolvedValue(createPopupPreviewStream({ stop }));
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

  await renderProbe('cam-1');
  await act(async () => Promise.resolve());

  expect(getUserMedia).toHaveBeenCalledWith({
    audio: false,
    video: {
      deviceId: { exact: 'cam-1' },
      frameRate: { ideal: 30 },
      height: { ideal: 720 },
      width: { ideal: 1280 },
    },
  });
  expect(container?.textContent).toContain('ready');

  act(() => root?.unmount());

  expect(stop).toHaveBeenCalledOnce();
});

it('stays idle without a selected camera', async () => {
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn() } });

  await renderProbe(null);

  expect(container?.textContent).toContain('idle');
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
});

it('previews the embedded shape and crop offsets used by the page camera', async () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const stream = createPopupPreviewStream();

  act(() =>
    root?.render(
      <WebcamPreview
        presentation={{
          cropOffset: { x: 0.5, y: -0.5 },
          mode: WebcamPresentationMode.EMBEDDED,
          shape: WebcamPresentationShape.CIRCLE,
        }}
        state={{ capabilities: null, settings: {}, status: 'ready', stream }}
      />
    )
  );

  expect(
    container.querySelector('[data-ui="popup.video.webcam-preview-mask"]')?.className
  ).toContain('rounded-full');
  expect(container.querySelector('video')?.style.objectPosition).toBe('75% 25%');
});
