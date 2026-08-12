// policyStateId: video-recording-surface-lease - validates commands against the active surface lease.
import type { VideoRecordingSurfaceCommandMessage } from '@sniptale/runtime-contracts/video/types/messages.surface';
import {
  loadVideoSettings,
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

const IDLE_SETTINGS_COMMANDS = new Set<VideoRecordingSurfaceCommandMessage['command']['kind']>([
  'set-microphone-enabled',
  'set-webcam-enabled',
  'select-microphone-device',
  'select-webcam-device',
  'update-embedded-camera',
]);

export async function runVideoRecordingSurfaceCommand(
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
  if (message.recordingId === null && !IDLE_SETTINGS_COMMANDS.has(message.command.kind)) {
    throw new Error('Recording lifecycle commands require an active recording');
  }

  const result = await applySurfaceCommand(message);
  const settings = await loadVideoSettings();
  return {
    success: true,
    result,
    snapshot: createVideoRecordingSurfaceSnapshot(lease, settings),
  };
}

async function applySurfaceCommand(message: VideoRecordingSurfaceCommandMessage): Promise<unknown> {
  switch (message.command.kind) {
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
        (settings) => ({ microphoneEnabled: settings.microphoneEnabled })
      );
    case 'set-webcam-enabled':
      return applyLiveSettingsWithDurableCommit(
        message,
        { webcamEnabled: message.command.enabled },
        (settings) => ({ webcamEnabled: settings.webcamEnabled === true })
      );
    case 'select-microphone-device':
      return applyLiveSettingsWithDurableCommit(
        message,
        { microphoneDeviceId: message.command.deviceId },
        buildMicrophoneLivePatch
      );
    case 'select-webcam-device':
      return applyLiveSettingsWithDurableCommit(
        message,
        { webcamDeviceId: message.command.deviceId },
        (settings) => ({ webcamDeviceId: settings.webcamDeviceId ?? null })
      );
    case 'update-embedded-camera': {
      const webcamPresentation = { mode: 'embedded' as const, ...message.command.appearance };
      await patchVideoSettings({ webcamPresentation });
      return { result: 'updated' };
    }
  }
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
      throw new Error(
        `Durable settings update failed and live rollback was not accepted: ${
          rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
        }`,
        { cause: error }
      );
    }
    throw error;
  }
  return { result: 'accepted' };
}
