import { RECORDING_EXPORT_FILENAME_PREFIX } from '@sniptale/ui/branding';
import { createLogger } from '@sniptale/platform/observability/logger';
import { saveRecordingSafely } from '../../workflows/media-hub/store';
import { sendRuntimeMessage } from '../../platform/runtime-messaging/index';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { beginRecordingFinalization, finishRecordingFinalization } from './finalization-replay';
import { persistStaticFrameSignals } from './signals/static-frame';

const logger = createLogger({ namespace: 'OffscreenRecordingFinalize' });

type FinalizeResult = {
  recordingId: string;
  filename: string;
};

type FinalizeRecordingOptions = {
  notifySaved?: boolean;
  notifyStopped?: boolean;
};

function stringifyFinalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getRecordingFilenameExtension(mimeType: string): 'mp4' | 'webm' {
  return mimeType.toLowerCase().includes('video/mp4') ? 'mp4' : 'webm';
}

function buildFinalizeResult(currentRecordingId: string | null, blob: Blob) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const extension = getRecordingFilenameExtension(blob.type);
  return {
    blob,
    filename: `${RECORDING_EXPORT_FILENAME_PREFIX}-${timestamp}.${extension}`,
    recordingId: currentRecordingId ?? `rec-${Date.now()}`,
  };
}

export function buildSidecarFilename(filenameSuffix: string, extension = 'webm'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  return `${RECORDING_EXPORT_FILENAME_PREFIX}-${timestamp}-${filenameSuffix}.${extension}`;
}

function buildSidecarFinalizeResult(params: {
  blob: Blob;
  filenameSuffix: string;
  recordingId: string;
}) {
  return {
    blob: params.blob,
    filename: buildSidecarFilename(params.filenameSuffix),
    recordingId: params.recordingId,
  };
}

async function triggerBackupDownload(recordingId: string, filename: string) {
  try {
    await sendRuntimeMessage({
      type: VideoMessageType.DOWNLOAD_RECORDING,
      recordingId,
      filename,
    });
    logger.debug('Backup download initiated', { filename });
  } catch (err) {
    logger.warn('Backup download failed', err);
  }
}

export function notifyRecordingStoppedBestEffort(reason: string, recordingId: string): void {
  void sendRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_RECORDING_STOPPED,
    recordingId,
  }).catch((error) => {
    logger.debug('Failed to notify runtime that recording stopped', {
      errorMessage: stringifyFinalizeError(error),
      reason,
      recordingId,
    });
  });
}

async function notifyVideoSavedToIdb(recordingId: string, filename: string): Promise<void> {
  await sendRuntimeMessage({
    type: VideoMessageType.VIDEO_SAVED_TO_IDB,
    recordingId,
    filename,
  }).catch((error) => {
    logger.debug('Failed to notify runtime about saved recording', {
      errorMessage: stringifyFinalizeError(error),
      filename,
      recordingId,
    });
  });
}

export function notifyVideoSavedToIdbBestEffort(
  recordingId: string,
  filename: string
): Promise<void> {
  return notifyVideoSavedToIdb(recordingId, filename);
}

export async function finalizeRecording(
  recordedChunks: Blob[],
  currentRecordingId: string | null,
  recorderMimeType?: string,
  discard = false,
  options: FinalizeRecordingOptions = {}
): Promise<FinalizeResult | null> {
  const shouldNotifySaved = options.notifySaved ?? true;
  const shouldNotifyStopped = options.notifyStopped ?? true;

  if (recordedChunks.length === 0) {
    logger.warn('No recorded chunks to process');
    notifyRecordingStoppedWhenEnabled(
      shouldNotifyStopped,
      'no-recorded-chunks',
      currentRecordingId
    );
    return null;
  }

  const mimeType = recorderMimeType || recordedChunks[0]?.type || 'video/webm';
  const { blob, filename, recordingId } = buildFinalizeResult(
    currentRecordingId,
    new Blob(recordedChunks, { type: mimeType })
  );
  if (!beginRecordingFinalization(recordingId, logger)) {
    return null;
  }

  return persistFinalizedRecording({
    blob,
    discard,
    filename,
    recordingId,
    shouldNotifySaved,
    shouldNotifyStopped,
  });
}

function notifyRecordingStoppedWhenEnabled(
  enabled: boolean,
  reason: string,
  recordingId: string | null
) {
  if (enabled && recordingId) {
    notifyRecordingStoppedBestEffort(reason, recordingId);
  }
}

async function saveFinalizedRecording(params: {
  blob: Blob;
  filename: string;
  recordingId: string;
  shouldNotifySaved: boolean;
}): Promise<boolean> {
  try {
    await saveRecordingSafely(params.recordingId, params.blob, params.filename);
    logger.info('Recording saved to media hub', {
      recordingId: params.recordingId,
      filename: params.filename,
    });
    await triggerBackupDownload(params.recordingId, params.filename);
    if (params.shouldNotifySaved) {
      await notifyVideoSavedToIdb(params.recordingId, params.filename);
    }
    void persistStaticFrameSignals(params.recordingId, params.blob);
    return true;
  } catch (err) {
    logger.error('Failed to save recording to media hub', err);
    return false;
  }
}

async function persistFinalizedRecording(params: {
  blob: Blob;
  discard: boolean;
  filename: string;
  recordingId: string;
  shouldNotifySaved: boolean;
  shouldNotifyStopped: boolean;
}): Promise<FinalizeResult | null> {
  let terminal = false;
  try {
    logger.info('Recording finalized', {
      filename: params.filename,
      discard: params.discard,
      sizeMb: Number((params.blob.size / 1024 / 1024).toFixed(2)),
    });
    terminal = await persistFinalizedRecordingBody(params);
    return terminal && !params.discard
      ? { recordingId: params.recordingId, filename: params.filename }
      : null;
  } finally {
    finishRecordingFinalization(params.recordingId, terminal);
  }
}

async function persistFinalizedRecordingBody(params: {
  blob: Blob;
  discard: boolean;
  filename: string;
  recordingId: string;
  shouldNotifySaved: boolean;
  shouldNotifyStopped: boolean;
}): Promise<boolean> {
  if (params.discard) {
    notifyRecordingStoppedWhenEnabled(
      params.shouldNotifyStopped,
      'recording-discarded',
      params.recordingId
    );
    return true;
  }

  const saved = await saveFinalizedRecording(params);
  notifyRecordingStoppedWhenEnabled(
    params.shouldNotifyStopped,
    saved ? 'recording-finalized' : 'media-hub-save-failed',
    params.recordingId
  );
  return saved;
}

export async function finalizeSidecarRecording(params: {
  chunks: Blob[];
  discard: boolean;
  filenameSuffix: string;
  mimeType?: string;
  recordingId: string;
}): Promise<FinalizeResult | null> {
  if (params.chunks.length === 0 || params.discard) {
    return null;
  }

  const mimeType = params.mimeType || params.chunks[0]?.type || 'video/webm';
  const { blob, filename, recordingId } = buildSidecarFinalizeResult({
    blob: new Blob(params.chunks, { type: mimeType }),
    filenameSuffix: params.filenameSuffix,
    recordingId: params.recordingId,
  });
  if (!beginRecordingFinalization(recordingId, logger)) {
    return null;
  }

  let terminal = false;
  try {
    await saveRecordingSafely(recordingId, blob, filename);
    await triggerBackupDownload(recordingId, filename);
    terminal = true;
  } catch (err) {
    logger.error('Failed to save sidecar recording to media hub', err);
    return null;
  } finally {
    finishRecordingFinalization(recordingId, terminal);
  }

  return {
    recordingId,
    filename,
  };
}
