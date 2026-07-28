import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type {
  CaptureMode,
  VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type { RuntimeMessagingTransport } from '../../../platform/runtime-messaging';
import { prepareRecordingStream } from '../setup';
import { recordingContext } from '../context';
import { initializeSidecarRecorders } from '../sidecar';
import { cleanupResources } from './cleanup';
import { finalizeRecordingBootstrap } from './recorder';
import { handleRecordingStartError, initializeRecordingSession } from './session';
import { waitForRecordingBegin } from './gate';

type StartRecordingParams = {
  streamId: string;
  settings: VideoRecordingSettings;
  tabId?: number;
  viewport?: { width: number; height: number; devicePixelRatio?: number };
  recordingId: string;
  captureMode?: CaptureMode;
  cropRegion?: { x: number; y: number; width: number; height: number };
  generation: number;
  streamInstanceId: string;
  surface?: { presetId: string; target: 'viewport' | 'window'; width: number; height: number };
};

export async function startRecording(
  params: StartRecordingParams,
  messaging: Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'>
): Promise<void> {
  try {
    await startRecordingInternal(params, messaging);
  } catch (error) {
    throw handleRecordingStartError(error, params.recordingId);
  }
}

function isStillStarting(recordingId: string): boolean {
  return (
    recordingContext.currentRecordingId === recordingId &&
    recordingContext.lifecycleState === 'starting'
  );
}

async function startRecordingInternal(
  params: StartRecordingParams,
  messaging: Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'>
) {
  const recordingId = initializeRecordingSession(params);
  const prepared = await prepareRecordingStream({
    streamId: params.streamId,
    settings: params.settings,
    ...(params.captureMode === undefined ? {} : { captureMode: params.captureMode }),
    ...(params.cropRegion === undefined ? {} : { cropRegion: params.cropRegion }),
    ...(params.viewport === undefined ? {} : { viewport: params.viewport }),
    ...(params.surface === undefined ? {} : { surface: params.surface }),
  });
  if (!isStillStarting(recordingId)) {
    cleanupResources();
    return;
  }
  recordingContext.sourceVideoWidth = prepared.rawVideoWidth;
  recordingContext.sourceVideoHeight = prepared.rawVideoHeight;
  recordingContext.tabOutputControls = prepared.tabOutputControls;
  recordingContext.tabOutputGeometry = prepared.tabOutputGeometry;

  const { streamInstanceId } = params;
  const begin = waitForRecordingBegin(
    {
      generation: params.generation,
      recordingId,
      streamInstanceId,
    },
    Math.max(0, params.settings.countdownSeconds ?? 0) * 1_000
  );
  // Observe rejection immediately: shared cleanup cancels this gate on DENY/transport failures.
  const observedBegin: Promise<{ ok: true } | { error: unknown; ok: false }> = begin.then(
    () => ({ ok: true }),
    (error: unknown) => ({ error, ok: false })
  );
  try {
    const response = await messaging.sendRuntimeMessage({
      type: VideoMessageType.OFFSCREEN_SOURCE_READY,
      generation: params.generation,
      recordingId,
      streamInstanceId,
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
  if (!isStillStarting(recordingId)) {
    cleanupResources();
    return;
  }

  await initializeSidecarRecorders({
    baseRecordingId: recordingId,
    settings: params.settings,
    ...(params.captureMode === undefined ? {} : { captureMode: params.captureMode }),
  });
  finalizeRecordingBootstrap({
    resolvedRecordingId: recordingId,
    settings: params.settings,
    cursorCaptureMode: prepared.cursorCaptureMode,
    trackSettings: prepared.trackSettings,
    durationTracker: recordingContext.durationTracker,
  });
}
