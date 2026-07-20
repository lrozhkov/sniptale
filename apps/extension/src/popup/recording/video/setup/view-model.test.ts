import { expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));

import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import type { VideoSetupPageProps } from './types';
import { getGalleryTitle, getVideoSetupViewModel } from './view-model';

type VideoSetupViewModelTestProps = Pick<
  VideoSetupPageProps,
  | 'appliedViewportPresetId'
  | 'appliedViewportTabId'
  | 'activeTabCapabilities'
  | 'captureMode'
  | 'galleryStatus'
  | 'isStartPending'
  | 'isLoadingWebcams'
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
      [CaptureMode.VIEWPORT_EMULATION]: { supported: true, reason: null },
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
    appliedViewportPresetId: 'preset-1',
    appliedViewportTabId: 1,
    captureMode: CaptureMode.TAB,
    galleryStatus: { text: '3 projects', pressure: 'healthy' as const },
    isLoadingWebcams: false,
    isStartPending: false,
    selectedPresetId: 'preset-1',
    viewportPresets: [{ id: 'preset-1', label: 'Preset', width: 1280, height: 720 }],
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

it('keeps diagnostics disabled until a viewport preset is applied to tab capture', () => {
  expect(
    getVideoSetupViewModel(
      createProps({
        appliedViewportPresetId: null,
        appliedViewportTabId: null,
        selectedPresetId: 'preset-1',
      })
    )
  ).toEqual(expect.objectContaining({ diagnosticsDisabled: true }));
  expect(
    getVideoSetupViewModel(
      createProps({
        appliedViewportPresetId: 'preset-1',
        appliedViewportTabId: 2,
      })
    )
  ).toEqual(expect.objectContaining({ diagnosticsDisabled: true }));
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
