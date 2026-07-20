// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { VideoActiveMediaStatus, type VideoActiveMediaSelection } from './media-status';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => {
    if (key === 'popup.video.webcamQualityActual') {
      return 'Received: {resolution}, {frameRate}';
    }
    if (key === 'popup.video.webcamQualityActualFps') {
      return '{fps} fps';
    }
    return key;
  },
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createMediaSelection(
  overrides: Partial<VideoActiveMediaSelection> = {}
): VideoActiveMediaSelection {
  const selection: VideoActiveMediaSelection = {
    microphoneDeviceId: 'mic-1',
    microphoneEnabled: true,
    microphoneSelected: true,
    microphoneLabel: 'Studio mic',
    webcamDeviceId: 'cam-1',
    webcamEnabled: true,
    webcamSelected: true,
    webcamSettings: null,
    webcamLabel: 'Desk camera',
  };
  return { ...selection, ...overrides };
}

async function renderStatus({
  onActiveRecordingSettingsChange = vi.fn().mockResolvedValue(undefined),
  selection = createMediaSelection(),
}: {
  onActiveRecordingSettingsChange?: (patch: Partial<VideoRecordingSettings>) => Promise<void>;
  selection?: VideoActiveMediaSelection;
} = {}) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <VideoActiveMediaStatus
        selection={selection}
        onActiveRecordingSettingsChange={onActiveRecordingSettingsChange}
      />
    );
  });

  return { onActiveRecordingSettingsChange };
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

it('shows mute controls for media selected before recording', async () => {
  const { onActiveRecordingSettingsChange } = await renderStatus();

  expect(container?.querySelector('video')).toBeNull();

  await act(async () => {
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="popup.video.activeMicrophoneMute"]')
      ?.click();
  });
  await act(async () => {
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="popup.video.activeWebcamMute"]')
      ?.click();
  });

  expect(onActiveRecordingSettingsChange).toHaveBeenCalledWith({ microphoneEnabled: false });
  expect(onActiveRecordingSettingsChange).toHaveBeenCalledWith({ webcamEnabled: false });
});

it('renders not-recorded copy without mute controls when media was not selected before recording', async () => {
  await renderStatus({
    selection: createMediaSelection({
      microphoneDeviceId: null,
      microphoneEnabled: false,
      microphoneSelected: false,
      webcamDeviceId: null,
      webcamEnabled: false,
      webcamSelected: false,
    }),
  });

  expect(container?.textContent).toContain('popup.video.activeMicrophoneNotRecorded');
  expect(container?.textContent).toContain('popup.video.activeWebcamNotRecorded');
  expect(container?.querySelector('button')).toBeNull();
});

it('keeps unmute controls visible after selected media is muted', async () => {
  await renderStatus({
    selection: createMediaSelection({
      microphoneEnabled: false,
      webcamEnabled: false,
    }),
  });

  expect(
    container?.querySelector('[aria-label="popup.video.activeMicrophoneUnmute"]')
  ).not.toBeNull();
  expect(container?.querySelector('[aria-label="popup.video.activeWebcamUnmute"]')).not.toBeNull();
});

it('shows actual webcam recording quality when offscreen reports track settings', async () => {
  await renderStatus({
    selection: createMediaSelection({
      webcamSettings: { frameRate: 30, height: 720, width: 1280 },
    }),
  });

  expect(container?.textContent).toContain('1280x720');
  expect(container?.textContent).toContain('30');
});
