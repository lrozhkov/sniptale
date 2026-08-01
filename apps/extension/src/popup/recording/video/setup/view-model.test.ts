import { expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));

import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  CaptureMode,
  VideoFrameRate,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import type { VideoSetupPageProps } from './types';
import { getGalleryTitle, getVideoSetupViewModel } from './view-model';

type VideoSetupViewModelTestProps = Pick<
  VideoSetupPageProps,
  | 'activeTabCapabilities'
  | 'captureMode'
  | 'galleryStatus'
  | 'isStartPending'
  | 'isLoadingWebcams'
  | 'settings'
  | 'selectedPresetId'
  | 'viewportPresets'
  | 'webcamDevices'
>;

function createActiveTabCapabilities(
  overrides: Partial<ActiveTabCapabilities> = {}
): ActiveTabCapabilities {
  return {
    tabId: 1,
    url: 'https://example.com',
    title: 'Example',
    isRestrictedPage: false,
    restrictedPageLabel: null,
    screenshotMode: { supported: true, reason: null },
    quickActions: { supported: true, reason: null },
    export: { supported: true, reason: null },
    videoByMode: {
      [CaptureMode.TAB]: { supported: true, reason: null },
      [CaptureMode.TAB_CROP]: { supported: true, reason: null },
      [CaptureMode.CAMERA]: { supported: true, reason: null },
      [CaptureMode.SCREEN]: { supported: true, reason: null },
    },
    ...overrides,
  };
}

function createProps(
  overrides: Partial<VideoSetupViewModelTestProps> = {}
): VideoSetupViewModelTestProps {
  return {
    activeTabCapabilities: createActiveTabCapabilities(),
    captureMode: CaptureMode.TAB,
    galleryStatus: { text: '3 projects', pressure: 'healthy' as const },
    isLoadingWebcams: false,
    isStartPending: false,
    settings: DEFAULT_VIDEO_SETTINGS,
    selectedPresetId: 'preset-1',
    viewportPresets: [
      {
        kind: 'user',
        id: 'preset-1',
        name: 'Preset',
        target: 'viewport',
        width: 1280,
        height: 720,
        enabled: true,
        order: 0,
      },
    ],
    webcamDevices: [{ deviceId: 'cam-1', label: 'Camera' }],
    ...overrides,
  };
}

it('derives a startable setup view model when the preset and mode are available', () => {
  const viewModel = getVideoSetupViewModel(createProps());

  expect(viewModel).toEqual(
    expect.objectContaining({
      canStart: true,
      controlledCursorDisabled: false,
      controlledCursorDisabledReason: null,
      galleryTitle: 't:popup.video.galleryTitle. 3 projects',
      selectedPreset: expect.objectContaining({ id: 'preset-1' }),
      startButtonLabel: 't:popup.video.startButton',
      startDisabledReason: null,
      systemAudioDisabled: false,
      diagnosticsDisabled: false,
    })
  );
});

it('keeps diagnostics disabled outside regular tab capture', () => {
  expect(getVideoSetupViewModel(createProps({ captureMode: CaptureMode.SCREEN }))).toEqual(
    expect.objectContaining({ diagnosticsDisabled: true })
  );
});

it('blocks start when the current mode is unavailable or pending', () => {
  const viewModel = getVideoSetupViewModel(
    createProps({
      activeTabCapabilities: createActiveTabCapabilities({
        videoByMode: {
          ...createActiveTabCapabilities().videoByMode,
          [CaptureMode.TAB]: { supported: false, reason: 'blocked' },
        },
      }),
      galleryStatus: null,
      isStartPending: true,
      selectedPresetId: null,
      viewportPresets: [],
    })
  );

  expect(viewModel).toEqual(
    expect.objectContaining({
      canStart: false,
      controlledCursorDisabled: false,
      controlledCursorDisabledReason: null,
      galleryTitle: 't:popup.video.galleryTitle',
      startButtonLabel: 't:popup.video.startPending',
      startDisabledReason: 'blocked',
    })
  );
});

it('keeps cursor-track recording disabled while desktop capture integration is pending', () => {
  const viewModel = getVideoSetupViewModel(
    createProps({
      captureMode: CaptureMode.SCREEN,
    })
  );

  expect(viewModel).toEqual(
    expect.objectContaining({
      controlledCursorDisabled: true,
      controlledCursorDisabledReason: 't:popup.video.controlledCursorDisabledUntilDesktop',
      systemAudioDisabled: true,
    })
  );
});

it('disables camera mode until a webcam is available', () => {
  const viewModel = getVideoSetupViewModel(
    createProps({
      captureMode: CaptureMode.CAMERA,
      webcamDevices: [],
    })
  );

  expect(viewModel).toEqual(
    expect.objectContaining({
      canStart: false,
      startDisabledReason: 't:popup.video.modeCameraUnavailable',
    })
  );
  expect(viewModel.modeCapabilities?.[CaptureMode.CAMERA]).toEqual({
    supported: false,
    reason: 't:popup.video.modeCameraUnavailable',
  });
});

it('keeps camera mode startable while disabling incompatible setup options', () => {
  const viewModel = getVideoSetupViewModel(
    createProps({
      captureMode: CaptureMode.CAMERA,
    })
  );

  expect(viewModel).toEqual(
    expect.objectContaining({
      canStart: true,
      controlledCursorDisabled: true,
      diagnosticsDisabled: true,
      systemAudioDisabled: true,
    })
  );
});

it('formats the gallery title consistently', () => {
  expect(getGalleryTitle(null)).toBe('t:popup.video.galleryTitle');
});

it('blocks a known TAB output that exceeds the shared live pixel-rate budget', () => {
  const viewModel = getVideoSetupViewModel(
    createProps({
      settings: {
        ...DEFAULT_VIDEO_SETTINGS,
        outputProfile: {
          ...DEFAULT_VIDEO_SETTINGS.outputProfile,
          frameRate: VideoFrameRate.FPS60,
          resolution: VideoResolutionPreset.P2160,
        },
      },
      viewportPresets: [
        {
          enabled: true,
          height: 900,
          id: 'preset-1',
          kind: 'user',
          name: '1440 × 900',
          order: 0,
          target: 'viewport',
          width: 1440,
        },
      ],
    })
  );

  expect(viewModel).toEqual(
    expect.objectContaining({
      canStart: false,
      knownOutputBasisDimensions: { height: 900, width: 1440 },
      startButtonLabel: 't:popup.video.startUnavailable',
      startDisabledReason: 't:popup.video.outputResourceUnsupported',
    })
  );
});
