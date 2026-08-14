// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  DEFAULT_VIDEO_OUTPUT_PROFILE,
  VideoFrameRate,
  VideoOutputCodec,
  VideoOutputContainer,
  VideoResolutionPreset,
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
          interactionDiagnosticsEnabled: false,
          microphoneDeviceId: null,
          microphoneEnabled: false,
          outputProfile: {
            ...DEFAULT_VIDEO_OUTPUT_PROFILE,
            quality: VideoQuality.HIGH,
          },
          qualityProfileId: 'builtin:optimal',
          systemAudioEnabled: true,
        }}
      />
    );
  });

  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const mp4Button = buttons.find((button) => button.textContent === 'MP4');
  const fourKButton = buttons.find((button) => button.textContent === '2160p (4K)');
  const manageButton = buttons.find(
    (button) => button.textContent === 'popup.video.manageQualityProfiles'
  );

  act(() => mp4Button?.click());
  expect(onChange).toHaveBeenCalledWith({
    outputProfile: {
      ...DEFAULT_VIDEO_OUTPUT_PROFILE,
      codec: VideoOutputCodec.AVC,
      container: VideoOutputContainer.MP4,
    },
    qualityProfileId: null,
  });

  act(() => fourKButton?.click());
  expect(onChange).toHaveBeenCalledWith({
    outputProfile: {
      ...DEFAULT_VIDEO_OUTPUT_PROFILE,
      frameRate: VideoFrameRate.FPS24,
      quality: VideoQuality.HIGH,
      resolution: VideoResolutionPreset.P2160,
    },
    qualityProfileId: null,
  });

  act(() => manageButton?.click());
  expect(openSettingsPageMock).toHaveBeenCalledWith({
    route: { section: 'media-quality', view: 'video' },
  });
});

it('disables a known over-budget frame-rate choice instead of silently accepting it', () => {
  act(() => {
    root?.render(
      <OutputSettingsPanel
        knownOutputBasisDimensions={{ height: 900, width: 1440 }}
        onChange={vi.fn()}
        settings={{
          ...DEFAULT_VIDEO_SETTINGS,
          outputProfile: {
            ...DEFAULT_VIDEO_OUTPUT_PROFILE,
            frameRate: VideoFrameRate.FPS24,
            resolution: VideoResolutionPreset.P2160,
          },
        }}
      />
    );
  });

  const sixtyFps = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (button) => button.textContent === '60 fps'
  );
  expect(sixtyFps?.disabled).toBe(true);
  expect(sixtyFps?.getAttribute('title')).toBe('popup.video.outputResourceUnsupported');
});
