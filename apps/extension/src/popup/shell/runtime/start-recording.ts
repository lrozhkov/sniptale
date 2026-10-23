import type { Dispatch, SetStateAction } from 'react';
import type { RuntimeResponseByType } from '../../../contracts/messaging/contracts/runtime-message';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import {
  openCameraRecorderPage,
  openSettingsPage,
} from '../../../platform/navigation/extension-pages';
import { translate } from '../../../platform/i18n/popup';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  CaptureMode,
  normalizeVideoSourceCount,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type { StartRecordingMessage } from '../../../contracts/video/types/messages';
import {
  requestMicrophonePermission,
  resolveMicrophoneDeviceId,
  type MicrophoneOption,
} from '../../recording/microphone';
import {
  requestWebcamPermission,
  resolveWebcamDeviceId,
  type WebcamOption,
} from '../../recording/webcam';
import { getPopupRuntimeErrorMessage } from '../../diagnostics/runtime-errors';
import { getPopupRuntimeServices } from '../../runtime-services';
import {
  readPopupMediaAccessState,
  type PopupMediaPermissionName,
} from '../../recording/media-devices';

type StartRecordingArgs = {
  targetTabId?: number | null;
  videoSettings: VideoRecordingSettings;
  captureMode: CaptureMode;
  microphoneDevices: MicrophoneOption[];
  viewportPresetId: string | null;
  webcamDevices: WebcamOption[];
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
  captureMode: CaptureMode,
  microphoneDevices: MicrophoneOption[],
  webcamDevices: WebcamOption[]
): VideoRecordingSettings {
  const sourceCount =
    captureMode === CaptureMode.SCREEN ? normalizeVideoSourceCount(settings.sourceCount) : 1;
  const webcamEnabled = captureMode === CaptureMode.CAMERA || settings.webcamEnabled === true;
  const hasMicrophoneInventory = microphoneDevices.some((device) => device.deviceId.length > 0);
  const hasWebcamInventory = webcamDevices.some((device) => device.deviceId.length > 0);

  return {
    ...settings,
    microphoneDeviceId:
      settings.microphoneEnabled && hasMicrophoneInventory
        ? resolveMicrophoneDeviceId(settings.microphoneDeviceId, microphoneDevices)
        : settings.microphoneDeviceId,
    sourceCount,
    webcamDeviceId:
      webcamEnabled && hasWebcamInventory
        ? resolveWebcamDeviceId(settings.webcamDeviceId ?? null, webcamDevices)
        : (settings.webcamDeviceId ?? null),
    ...(sourceCount > 1 ? { systemAudioEnabled: false } : {}),
    ...(captureMode === CaptureMode.CAMERA
      ? {
          controlledCursorCaptureEnabled: false,
          interactionDiagnosticsEnabled: false,
          sourceCount: 1,
          systemAudioEnabled: false,
          webcamEnabled,
        }
      : {}),
    controlledCursorCaptureEnabled: false,
  };
}

async function hasCapturePermission(permissionName: PopupMediaPermissionName): Promise<boolean> {
  if ((await readPopupMediaAccessState(permissionName)) === 'granted') return true;
  await openSettingsPage({
    requestMediaAccess: permissionName,
    route: { section: 'access-data', view: 'permissions' },
  });
  return false;
}

async function ensureCapturePermissions(
  settings: VideoRecordingSettings,
  setStartError: Dispatch<SetStateAction<string | null>>
): Promise<boolean> {
  if (settings.microphoneEnabled && !(await hasCapturePermission('microphone'))) return false;
  if (settings.webcamEnabled && !(await hasCapturePermission('camera'))) return false;

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
  viewportPresetId: string | null;
}): StartRecordingMessage {
  const viewportPresetId =
    args.captureMode === CaptureMode.TAB || args.captureMode === CaptureMode.TAB_CROP
      ? args.viewportPresetId
      : null;
  const baseMessage = {
    type: VideoMessageType.START_RECORDING,
    settings: args.settings,
    captureMode: args.captureMode,
    ...(args.tabId === undefined ? {} : { tabId: args.tabId }),
  };

  return {
    ...baseMessage,
    viewportPresetId,
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
  setStartError: Dispatch<SetStateAction<string | null>>,
  targetTabId?: number | null
): Promise<number | null> {
  if (captureMode === CaptureMode.CAMERA) {
    return null;
  }

  if (targetTabId !== undefined) {
    if (targetTabId !== null) {
      const tab = await browserTabs.get(targetTabId);
      if (tab.id === targetTabId) return targetTabId;
    }
    setStartError(translate('popup.common.noActiveTab'));
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
    throw response.error ?? response;
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
  const recordingCaptureMode = captureMode;
  const sanitizedSettings = sanitizeRecordingSettings(
    videoSettings,
    recordingCaptureMode,
    args.microphoneDevices,
    args.webcamDevices
  );

  try {
    if (!(await ensureCapturePermissions(sanitizedSettings, setStartError))) {
      return;
    }

    const tabId = await resolveActiveTabId(recordingCaptureMode, setStartError, args.targetTabId);
    if (recordingCaptureMode !== CaptureMode.CAMERA && tabId === null) {
      return;
    }

    setIsStartPending(true);

    const startMessage = createStartRecordingMessage({
      captureMode: recordingCaptureMode,
      settings: sanitizedSettings,
      ...(tabId === null ? {} : { tabId }),
      viewportPresetId: args.viewportPresetId,
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
