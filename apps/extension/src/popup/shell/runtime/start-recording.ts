import type { Dispatch, SetStateAction } from 'react';
import type { RuntimeResponseByType } from '../../../contracts/messaging/contracts/runtime-message';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { openCameraRecorderPage } from '../../../platform/navigation/extension-pages';
import { translate } from '../../../platform/i18n';
import type { ViewportPreset } from '../../../contracts/settings';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  CaptureMode,
  normalizeVideoSourceCount,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type { StartRecordingMessage } from '../../../contracts/video/types/messages';
import { requestMicrophonePermission } from '../../recording/microphone';
import { requestWebcamPermission } from '../../recording/webcam';
import {
  getPopupResponseErrorMessage,
  getPopupRuntimeErrorMessage,
} from '../../diagnostics/runtime-errors';
import { getPopupRuntimeServices } from './services';

type StartRecordingArgs = {
  videoSettings: VideoRecordingSettings;
  captureMode: CaptureMode;
  viewportPreset: ViewportPreset | null;
  setRecordingControlCapability: Dispatch<
    SetStateAction<{ controlToken: string; recordingId: string } | null>
  >;
  setIsStartPending: Dispatch<SetStateAction<boolean>>;
  setStartError: Dispatch<SetStateAction<string | null>>;
};

type StartRecordingResponse = RuntimeResponseByType[typeof VideoMessageType.START_RECORDING];

type StartRecordingResponseActions = {
  setIsStartPending: Dispatch<SetStateAction<boolean>>;
  setRecordingControlCapability: Dispatch<
    SetStateAction<{ controlToken: string; recordingId: string } | null>
  >;
  setStartError: Dispatch<SetStateAction<string | null>>;
};

function sanitizeRecordingSettings(
  settings: VideoRecordingSettings,
  captureMode: CaptureMode
): VideoRecordingSettings {
  const sourceCount =
    captureMode === CaptureMode.SCREEN ? normalizeVideoSourceCount(settings.sourceCount) : 1;

  return {
    ...settings,
    sourceCount,
    ...(sourceCount > 1 ? { systemAudioEnabled: false } : {}),
    ...(captureMode === CaptureMode.CAMERA
      ? {
          controlledCursorCaptureEnabled: false,
          diagnosticsEnabled: false,
          sourceCount: 1,
          systemAudioEnabled: false,
          webcamEnabled: true,
        }
      : {}),
    controlledCursorCaptureEnabled: false,
  };
}

function getRecordingCaptureMode(captureMode: CaptureMode): CaptureMode {
  return captureMode === CaptureMode.VIEWPORT_EMULATION ? CaptureMode.TAB : captureMode;
}

async function ensureCapturePermissions(
  settings: VideoRecordingSettings,
  setStartError: Dispatch<SetStateAction<string | null>>
): Promise<boolean> {
  if (settings.microphoneEnabled) {
    try {
      await requestMicrophonePermission(settings.microphoneDeviceId);
    } catch (error) {
      setStartError(getPopupRuntimeErrorMessage(error, 'popup.video.microphoneAccessError'));
      return false;
    }
  }

  if (settings.webcamEnabled) {
    try {
      await requestWebcamPermission(settings.webcamDeviceId);
    } catch (error) {
      setStartError(getPopupRuntimeErrorMessage(error, 'popup.video.webcamAccessError'));
      return false;
    }
  }

  return true;
}

function createStartRecordingMessage(args: {
  captureMode: CaptureMode;
  settings: VideoRecordingSettings;
  tabId?: number;
  viewportPreset: ViewportPreset | null;
}): StartRecordingMessage {
  const baseMessage = {
    type: VideoMessageType.START_RECORDING,
    settings: args.settings,
    captureMode: args.captureMode,
    ...(args.tabId === undefined ? {} : { tabId: args.tabId }),
  };

  if (!args.viewportPreset) {
    return baseMessage;
  }

  return {
    ...baseMessage,
    viewportPreset: {
      id: args.viewportPreset.id,
      width: args.viewportPreset.width,
      height: args.viewportPreset.height,
      label: args.viewportPreset.label,
    },
  };
}

function getNonAcceptedStartMessage(result: unknown): string {
  if (result === 'cancelled') {
    return translate('popup.video.startRecordingCancelled');
  }

  if (result === 'already-active' || result === 'duplicate-preparing') {
    return translate('popup.video.startRecordingAlreadyActive');
  }

  return translate('popup.video.startRecordingError');
}

async function resolveActiveTabId(
  captureMode: CaptureMode,
  setStartError: Dispatch<SetStateAction<string | null>>
): Promise<number | null> {
  if (captureMode === CaptureMode.CAMERA) {
    return null;
  }

  const [tab] = await browserTabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStartError(translate('popup.common.noActiveTab'));
    return null;
  }

  return tab.id;
}

function applyStartRecordingResponse(
  response: StartRecordingResponse,
  actions: StartRecordingResponseActions,
  captureMode: CaptureMode
): void {
  if (response?.success === false) {
    throw new Error(getPopupResponseErrorMessage(response, 'popup.video.startRecordingError'));
  }

  if (response?.result !== 'accepted') {
    actions.setIsStartPending(false);
    actions.setStartError(getNonAcceptedStartMessage(response?.result));
    actions.setRecordingControlCapability(null);
    return;
  }

  if (typeof response?.controlToken === 'string' && typeof response.recordingId === 'string') {
    actions.setRecordingControlCapability({
      controlToken: response.controlToken,
      recordingId: response.recordingId,
    });
    if (captureMode === CaptureMode.CAMERA && typeof response.cameraLaunchToken === 'string') {
      void openCameraRecorderPage({
        launchToken: response.cameraLaunchToken,
        recordingId: response.recordingId,
      }).catch(() => {
        actions.setStartError(translate('popup.video.openCameraWindowError'));
      });
    } else if (captureMode === CaptureMode.CAMERA) {
      actions.setStartError(translate('popup.video.openCameraWindowError'));
    }
  }
}

export async function startRecordingHandler(args: StartRecordingArgs): Promise<void> {
  const {
    videoSettings,
    captureMode,
    setIsStartPending,
    setRecordingControlCapability,
    setStartError,
  } = args;
  const recordingCaptureMode = getRecordingCaptureMode(captureMode);
  const sanitizedSettings = sanitizeRecordingSettings(videoSettings, recordingCaptureMode);

  try {
    if (!(await ensureCapturePermissions(sanitizedSettings, setStartError))) {
      return;
    }

    const tabId = await resolveActiveTabId(recordingCaptureMode, setStartError);
    if (recordingCaptureMode !== CaptureMode.CAMERA && tabId === null) {
      return;
    }

    setIsStartPending(true);

    const startMessage = createStartRecordingMessage({
      captureMode: recordingCaptureMode,
      settings: sanitizedSettings,
      ...(tabId === null ? {} : { tabId }),
      viewportPreset: null,
    });
    const response = await getPopupRuntimeServices().messaging.sendRuntimeMessage(startMessage);

    applyStartRecordingResponse(
      response,
      {
        setIsStartPending,
        setRecordingControlCapability,
        setStartError,
      },
      recordingCaptureMode
    );
  } catch (error) {
    setIsStartPending(false);
    setRecordingControlCapability(null);
    setStartError(getPopupRuntimeErrorMessage(error, 'popup.video.startRecordingError'));
  }
}
