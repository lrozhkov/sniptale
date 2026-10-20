import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  CaptureMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type { RecordingFrameClockBinding } from '../../../contracts/video/recording-frame-clock';
import type { RuntimeMessagingTransport } from '../../../platform/runtime-messaging';
import { prepareCountdownCameraPreview, retireCountdownCameraPeers } from '../countdown-preview';
import { recordingContext } from '../context';
import type { RecordingSetupResult } from '../setup';
import { cleanupResources } from './cleanup';
import { waitForRecordingBegin } from './gate';

function isStillStarting(recordingId: string): boolean {
  return (
    recordingContext.currentRecordingId === recordingId &&
    recordingContext.lifecycleState === 'starting'
  );
}

export async function admitPreparedRecordingSource(
  args: {
    binding: RecordingFrameClockBinding;
    captureMode: CaptureMode;
    settings: VideoRecordingSettings;
    prepared: Pick<RecordingSetupResult, 'rawVideoWidth' | 'rawVideoHeight' | 'rawTrackSettings'>;
  },
  messaging: Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'>
): Promise<boolean> {
  const { binding, captureMode, prepared, settings } = args;
  await prepareCountdownCameraPreview({
    binding,
    captureMode,
    settings,
    ...(captureMode === CaptureMode.CAMERA ? { stream: recordingContext.sourceStream } : {}),
  });
  if (!isStillStarting(binding.recordingId)) {
    cleanupResources();
    return false;
  }
  const begin = waitForRecordingBegin(binding, Math.max(0, settings.countdownSeconds ?? 0) * 1000);
  const observedBegin: Promise<{ ok: true } | { error: unknown; ok: false }> = begin.then(
    () => ({ ok: true }),
    (error: unknown) => ({ error, ok: false })
  );
  try {
    const response = await messaging.sendRuntimeMessage({
      type: VideoMessageType.OFFSCREEN_SOURCE_READY,
      ...binding,
      videoWidth: prepared.rawVideoWidth,
      videoHeight: prepared.rawVideoHeight,
      trackSettings: {
        ...(prepared.rawTrackSettings.width === undefined
          ? {}
          : { width: prepared.rawTrackSettings.width }),
        ...(prepared.rawTrackSettings.height === undefined
          ? {}
          : { height: prepared.rawTrackSettings.height }),
        ...(prepared.rawTrackSettings.frameRate === undefined
          ? {}
          : { frameRate: prepared.rawTrackSettings.frameRate }),
      },
    });
    if (response?.success !== true || response.result !== 'ALLOW') {
      throw new Error('source-dimensions-mismatch');
    }
  } catch (error) {
    cleanupResources();
    await observedBegin;
    throw error;
  }
  const beginResult = await observedBegin;
  if (!beginResult.ok) throw beginResult.error;
  retireCountdownCameraPeers(binding);
  if (!isStillStarting(binding.recordingId)) {
    cleanupResources();
    return false;
  }
  return true;
}
