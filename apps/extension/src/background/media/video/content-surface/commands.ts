// policyStateId: video-recording-surface-lease - validates commands against the active surface lease.
import type { VideoRecordingSurfaceCommandMessage } from '@sniptale/runtime-contracts/video/types/messages.surface';
import {
  loadVideoSettings,
  mutateVideoSettings,
  patchVideoSettings,
} from '../../../../composition/persistence/capture-settings';
import {
  cancelRecordingStart,
  pauseRecording,
  resumeRecording,
  stopRecording,
  updateRecordingSettings,
} from '../runtime/manager/controls';
import { createVideoRecordingSurfaceSnapshot } from './snapshot';
import {
  ensureVideoRecordingSurfaceLeaseHydrated,
  updateVideoRecordingSurface,
  validateVideoRecordingSurfaceCapability,
} from './surface-lease';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import {
  closeVideoRecordingCameraPeerForLease,
  listVideoRecordingMediaDevices,
  switchVideoRecordingCameraPeerInput,
} from './camera-peer';
import { runSerializedVideoRecordingMediaMutation } from './mutation-queue';

const IDLE_SETTINGS_COMMANDS = new Set<VideoRecordingSurfaceCommandMessage['command']['kind']>([
  'set-microphone-enabled',
  'set-webcam-enabled',
  'select-microphone-device',
  'select-webcam-device',
  'update-embedded-camera',
  'set-toolbar-requested',
  'set-auto-fade-delay',
  'set-spotlight-settings',
  'list-media-devices',
]);

const SERIALIZED_MEDIA_COMMANDS = new Set<VideoRecordingSurfaceCommandMessage['command']['kind']>([
  'set-microphone-enabled',
  'set-webcam-enabled',
  'select-microphone-device',
  'select-webcam-device',
]);

async function requireAuthorizedSurfaceCommand(
  tabId: number,
  message: VideoRecordingSurfaceCommandMessage
) {
  const lease = await ensureVideoRecordingSurfaceLeaseHydrated();
  if (
    !lease ||
    lease.surfaceSessionId !== message.surfaceSessionId ||
    !validateVideoRecordingSurfaceCapability({
      capabilityEpoch: message.capabilityEpoch,
      documentGeneration: message.documentGeneration,
      recordingId: message.recordingId,
      surfaceToken: message.surfaceToken,
      tabId,
    })
  ) {
    throw new Error('Unauthorized or stale video recording surface command');
  }
  return lease;
}

export async function runVideoRecordingSurfaceCommand(
  tabId: number,
  message: VideoRecordingSurfaceCommandMessage
) {
  const lease = await requireAuthorizedSurfaceCommand(tabId, message);
  if (
    message.recordingId === null &&
    message.command.kind !== 'cancel-start' &&
    !IDLE_SETTINGS_COMMANDS.has(message.command.kind)
  ) {
    throw new Error('Recording lifecycle commands require an active recording');
  }

  const execute = async (authorizedLease: typeof lease) => {
    const result = await applySurfaceCommand(tabId, message);
    const [settings, currentLease] = await Promise.all([
      loadVideoSettings(),
      ensureVideoRecordingSurfaceLeaseHydrated(),
    ]);
    return {
      success: true,
      result,
      snapshot: createVideoRecordingSurfaceSnapshot(currentLease ?? authorizedLease, settings),
    };
  };

  if (SERIALIZED_MEDIA_COMMANDS.has(message.command.kind)) {
    return runSerializedVideoRecordingMediaMutation(message.surfaceSessionId, async () => {
      const currentLease = await requireAuthorizedSurfaceCommand(tabId, message);
      return execute(currentLease);
    });
  }

  return execute(lease);
}

async function applySurfaceCommand(
  tabId: number,
  message: VideoRecordingSurfaceCommandMessage
): Promise<unknown> {
  switch (message.command.kind) {
    case 'list-media-devices':
      return { mediaDevices: await listVideoRecordingMediaDevices(message.command.deviceKind) };
    case 'set-toolbar-requested':
      await updateVideoRecordingSurface(message.surfaceSessionId, {
        toolbarRequested: message.command.enabled,
      });
      return { result: 'updated' };
    case 'set-auto-fade-delay':
      await patchVideoSettings({ autoFadeDelay: message.command.delay });
      return { result: 'updated' };
    case 'set-spotlight-settings': {
      const { clickAnimationEnabled, cursorDimmingEnabled, cursorHaloEnabled } = message.command;
      await mutateVideoSettings((current) => ({
        ...current,
        recordingSurface: {
          ...current.recordingSurface,
          toolbarEnabled: current.recordingSurface?.toolbarEnabled ?? false,
          cursorSpotlightEnabled: cursorHaloEnabled,
          cursorDimmingEnabled,
          cursorClickAnimationEnabled: clickAnimationEnabled,
        },
      }));
      return { result: 'updated' };
    }
    case 'cancel-start':
      return requireAcceptedResult(await cancelRecordingStart(), [
        'accepted',
        'cancelled-before-active',
      ]);
    case 'pause':
      return requireAcceptedResult(await pauseRecording(), ['accepted']);
    case 'resume':
      return requireAcceptedResult(await resumeRecording(), ['accepted']);
    case 'stop':
      return requireAcceptedResult(await stopRecording(false), ['accepted', 'already-stopping']);
    case 'set-microphone-enabled':
      return applyLiveSettingsWithDurableCommit(
        message,
        { microphoneEnabled: message.command.enabled },
        buildMicrophoneLivePatch
      );
    case 'set-webcam-enabled':
      await applyLiveSettingsWithDurableCommit(
        message,
        { webcamEnabled: message.command.enabled },
        (settings) => ({ webcamEnabled: settings.webcamEnabled === true })
      );
      if (message.command.enabled) {
        await advanceCameraPreviewPeer(message.surfaceSessionId);
      }
      return { result: 'accepted' };
    case 'select-microphone-device':
      return applyLiveSettingsWithDurableCommit(
        message,
        { microphoneDeviceId: message.command.deviceId },
        buildMicrophoneLivePatch
      );
    case 'select-webcam-device':
      if (!message.recordingId) {
        return switchIdleCameraWithDurableCommit(tabId, message, message.command.deviceId);
      }
      await applyLiveSettingsWithDurableCommit(
        message,
        { webcamDeviceId: message.command.deviceId },
        (settings) => ({ webcamDeviceId: settings.webcamDeviceId ?? null })
      );
      return { result: 'accepted' };
    case 'update-embedded-camera': {
      const webcamPresentation = { mode: 'embedded' as const, ...message.command.appearance };
      await patchVideoSettings({ webcamPresentation });
      return { result: 'updated' };
    }
  }
}

async function switchIdleCameraWithDurableCommit(
  tabId: number,
  message: VideoRecordingSurfaceCommandMessage,
  deviceId: string | null
) {
  const previous = await loadVideoSettings();
  const lease = await ensureVideoRecordingSurfaceLeaseHydrated();
  if (!lease || lease.surfaceSessionId !== message.surfaceSessionId) {
    throw new Error('Camera preview surface is unavailable');
  }
  await switchVideoRecordingCameraPeerInput(lease, deviceId);
  try {
    await requireAuthorizedSurfaceCommand(tabId, message);
    await patchVideoSettings({ webcamDeviceId: deviceId });
  } catch (error) {
    try {
      await switchVideoRecordingCameraPeerInput(lease, previous.webcamDeviceId ?? null);
    } catch (rollbackError) {
      await updateVideoRecordingSurface(message.surfaceSessionId, { lifecycle: 'degraded' });
      throw new AggregateError(
        [error, rollbackError],
        `Durable camera selection failed: ${
          error instanceof Error ? error.message : String(error)
        }; preview rollback failed: ${
          rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
        }`,
        { cause: rollbackError }
      );
    }
    throw error;
  }
  return { result: 'accepted' };
}

async function advanceCameraPreviewPeer(surfaceSessionId: string): Promise<void> {
  const lease = await ensureVideoRecordingSurfaceLeaseHydrated();
  if (lease?.surfaceSessionId !== surfaceSessionId) return;
  await closeVideoRecordingCameraPeerForLease(lease).catch(() => undefined);
  await updateVideoRecordingSurface(surfaceSessionId, {
    peerGeneration: lease.peerGeneration + 1,
  });
}

function requireAcceptedResult<T extends { error?: string; result: string }>(
  result: T,
  accepted: readonly string[]
): T {
  if (accepted.includes(result.result)) return result;
  throw new Error(result.error ?? `Recording command was not accepted: ${result.result}`);
}

function buildMicrophoneLivePatch(settings: VideoRecordingSettings) {
  return {
    ...(settings.autoGainControl === undefined
      ? {}
      : { autoGainControl: settings.autoGainControl }),
    ...(settings.echoCancellation === undefined
      ? {}
      : { echoCancellation: settings.echoCancellation }),
    microphoneDeviceId: settings.microphoneDeviceId,
    microphoneEnabled: settings.microphoneEnabled,
    ...(settings.microphoneGain === undefined ? {} : { microphoneGain: settings.microphoneGain }),
    ...(settings.noiseSuppression === undefined
      ? {}
      : { noiseSuppression: settings.noiseSuppression }),
  };
}

async function applyLiveSettingsWithDurableCommit(
  message: VideoRecordingSurfaceCommandMessage,
  durablePatch: Partial<VideoRecordingSettings>,
  buildRollbackPatch: (settings: VideoRecordingSettings) => Partial<VideoRecordingSettings>
) {
  const previous = await loadVideoSettings();
  if (!message.recordingId) {
    await patchVideoSettings(durablePatch);
    return { result: 'updated' };
  }
  const next = { ...previous, ...durablePatch };
  const livePatch = buildRollbackPatch(next);
  requireAcceptedResult(await updateRecordingSettings(livePatch), ['accepted']);
  try {
    await patchVideoSettings(durablePatch);
  } catch (error) {
    const rollback = await updateRecordingSettings(buildRollbackPatch(previous));
    try {
      requireAcceptedResult(rollback, ['accepted']);
    } catch (rollbackError) {
      await updateVideoRecordingSurface(message.surfaceSessionId, { lifecycle: 'degraded' });
      throw new AggregateError(
        [error, rollbackError],
        `Durable settings update failed: ${
          error instanceof Error ? error.message : String(error)
        }; live rollback was not accepted: ${
          rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
        }`,
        { cause: rollbackError }
      );
    }
    throw error;
  }
  return { result: 'accepted' };
}
