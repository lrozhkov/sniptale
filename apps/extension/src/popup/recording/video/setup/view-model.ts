import { translate } from '../../../../platform/i18n';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { supportsCursorTrackTelemetry } from '../copy';
import type { VideoSetupPageProps, VideoSetupViewModel } from './types';

type VideoSetupViewModelArgs = Pick<
  VideoSetupPageProps,
  | 'captureMode'
  | 'selectedPresetId'
  | 'appliedViewportPresetId'
  | 'appliedViewportTabId'
  | 'viewportPresets'
  | 'activeTabCapabilities'
  | 'pageAccessDisabledReason'
  | 'isStartPending'
  | 'galleryStatus'
  | 'webcamDevices'
  | 'isLoadingWebcams'
>;

export function getGalleryTitle(galleryStatus: VideoSetupPageProps['galleryStatus']): string {
  const galleryStatusText =
    galleryStatus &&
    typeof galleryStatus === 'object' &&
    'text' in galleryStatus &&
    typeof galleryStatus.text === 'string'
      ? galleryStatus.text
      : null;

  return galleryStatusText
    ? `${translate('popup.video.galleryTitle')}. ${galleryStatusText}`
    : translate('popup.video.galleryTitle');
}

function getStartDisabledReason(params: {
  currentModeCapability: VideoSetupViewModel['currentModeCapability'];
}): string | null {
  return params.currentModeCapability.reason ?? null;
}

function getModeCapabilities(params: {
  activeTabCapabilities: VideoSetupPageProps['activeTabCapabilities'];
  isLoadingWebcams: boolean;
  pageAccessDisabledReason: string | null;
  webcamDevices: VideoSetupPageProps['webcamDevices'];
}): VideoSetupPageProps['activeTabCapabilities']['videoByMode'] {
  const cameraCapability =
    params.webcamDevices.length > 0
      ? params.activeTabCapabilities.videoByMode[CaptureMode.CAMERA]
      : {
          supported: false,
          reason: params.isLoadingWebcams
            ? translate('popup.video.webcamLoading')
            : translate('popup.video.modeCameraUnavailable'),
        };

  if (!params.pageAccessDisabledReason) {
    return {
      ...params.activeTabCapabilities.videoByMode,
      [CaptureMode.CAMERA]: cameraCapability,
    };
  }

  return {
    ...params.activeTabCapabilities.videoByMode,
    [CaptureMode.CAMERA]: cameraCapability,
    [CaptureMode.TAB]: {
      supported: false,
      reason:
        params.activeTabCapabilities.videoByMode[CaptureMode.TAB].reason ??
        params.pageAccessDisabledReason,
    },
    [CaptureMode.TAB_CROP]: {
      supported: false,
      reason:
        params.activeTabCapabilities.videoByMode[CaptureMode.TAB_CROP].reason ??
        params.pageAccessDisabledReason,
    },
    [CaptureMode.VIEWPORT_EMULATION]: {
      supported: false,
      reason:
        params.activeTabCapabilities.videoByMode[CaptureMode.VIEWPORT_EMULATION].reason ??
        params.pageAccessDisabledReason,
    },
  };
}

function getStartButtonLabel(params: {
  canStart: boolean;
  currentModeCapability: VideoSetupViewModel['currentModeCapability'];
  isStartPending: boolean;
}): string {
  if (params.isStartPending) {
    return translate('popup.video.startPending');
  }

  if (params.currentModeCapability.reason) {
    return translate('popup.video.startUnavailable');
  }

  return translate('popup.video.startButton');
}

export function getVideoSetupViewModel({
  captureMode,
  selectedPresetId,
  appliedViewportPresetId,
  appliedViewportTabId,
  viewportPresets,
  activeTabCapabilities,
  pageAccessDisabledReason,
  isStartPending,
  galleryStatus,
  webcamDevices,
  isLoadingWebcams,
}: VideoSetupViewModelArgs): VideoSetupViewModel {
  const selectedPreset = viewportPresets.find((preset) => preset.id === selectedPresetId) ?? null;
  const appliedViewportPreset =
    viewportPresets.find((preset) => preset.id === appliedViewportPresetId) ?? null;
  const modeCapabilities = getModeCapabilities({
    activeTabCapabilities,
    isLoadingWebcams,
    pageAccessDisabledReason: pageAccessDisabledReason ?? null,
    webcamDevices,
  });
  const currentModeCapability = modeCapabilities[captureMode];
  const startDisabledReason = getStartDisabledReason({
    currentModeCapability,
  });
  const canStart = !isStartPending && !startDisabledReason;
  const recordingOptionState = getRecordingOptionState({
    activeTabId: activeTabCapabilities.tabId,
    appliedViewportPreset,
    appliedViewportTabId,
    captureMode,
  });
  const { controlledCursorDisabled, controlledCursorDisabledReason } =
    getControlledCursorState(captureMode);

  return {
    selectedPreset,
    currentModeCapability,
    modeCapabilities,
    startDisabledReason,
    canStart,
    systemAudioDisabled: recordingOptionState.systemAudioDisabled,
    diagnosticsDisabled: recordingOptionState.diagnosticsDisabled,
    controlledCursorDisabled,
    controlledCursorDisabledReason,
    startButtonLabel: getStartButtonLabel({ canStart, currentModeCapability, isStartPending }),
    galleryTitle: getGalleryTitle(galleryStatus),
  };
}

function getRecordingOptionState(params: {
  activeTabId: number | null;
  appliedViewportPreset: VideoSetupViewModel['selectedPreset'];
  appliedViewportTabId: number | null;
  captureMode: CaptureMode;
}) {
  return {
    systemAudioDisabled:
      params.captureMode === CaptureMode.SCREEN || params.captureMode === CaptureMode.CAMERA,
    diagnosticsDisabled:
      params.captureMode === CaptureMode.CAMERA ||
      params.captureMode !== CaptureMode.TAB ||
      params.activeTabId === null ||
      params.appliedViewportTabId !== params.activeTabId ||
      params.appliedViewportPreset === null,
  };
}

function getControlledCursorState(captureMode: CaptureMode) {
  if (captureMode === CaptureMode.CAMERA) {
    return {
      controlledCursorDisabled: true,
      controlledCursorDisabledReason: translate('popup.video.modeCameraHint'),
    };
  }

  const controlledCursorDisabled = !supportsCursorTrackTelemetry(captureMode);

  return {
    controlledCursorDisabled,
    controlledCursorDisabledReason: controlledCursorDisabled
      ? translate('popup.video.controlledCursorDisabledUntilDesktop')
      : null,
  };
}
