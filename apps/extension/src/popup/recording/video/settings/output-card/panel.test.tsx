// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  DEFAULT_VIDEO_RECORDING_OUTPUT_SETTINGS,
  VideoOutputCodec,
  VideoOutputContainer,
  VideoQuality,
} from '@sniptale/runtime-contracts/video/types/types';

const { openSettingsPageMock } = vi.hoisted(() => ({
  openSettingsPageMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/navigation/extension-pages')>()),
  openSettingsPage: openSettingsPageMock,
}));

import { OutputSettingsPanel } from './panel';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal('MediaRecorder', { isTypeSupported: vi.fn(() => true) });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('offers fast advanced choices and marks manual combinations as custom', () => {
  const onChange = vi.fn();
  act(() => {
    root?.render(
      <OutputSettingsPanel
        onChange={onChange}
        settings={{
          ...DEFAULT_VIDEO_SETTINGS,
          autoFadeDelay: 2,
          countdownSeconds: 3,
          diagnosticsEnabled: false,
          microphoneDeviceId: null,
          microphoneEnabled: false,
          openEditorAfterRecording: false,
          output: DEFAULT_VIDEO_RECORDING_OUTPUT_SETTINGS,
          quality: VideoQuality.HIGH,
          qualityProfileId: 'builtin:optimal',
          systemAudioEnabled: true,
        }}
      />
    );
  });

  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const mp4Button = buttons.find((button) => button.textContent === 'MP4');
  const manageButton = buttons.find(
    (button) => button.textContent === 'popup.video.manageQualityProfiles'
  );

  act(() => mp4Button?.click());
  expect(onChange).toHaveBeenCalledWith({
    output: {
      ...DEFAULT_VIDEO_RECORDING_OUTPUT_SETTINGS,
      codec: VideoOutputCodec.AVC,
      container: VideoOutputContainer.MP4,
    },
    qualityProfileId: null,
  });

  act(() => manageButton?.click());
  expect(openSettingsPageMock).toHaveBeenCalledWith({ section: 'video' });
});
