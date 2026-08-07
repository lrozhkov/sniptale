import {
  initDB,
  subscribeToDbTermination,
} from '../../composition/persistence/infrastructure/indexed-db/core';
import { createLogger } from '@sniptale/platform/observability/logger';
import { initTracer } from '@sniptale/platform/observability/message-tracer';
import { sendRuntimeMessage } from '../../platform/runtime-messaging/index';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { reconcileProjectExportJobs } from '../project-export';
import { cleanupOrphanedRecordingStaging } from '../../composition/persistence/recordings/staging';
import { reconcileRecordingCompletionOutbox } from '../recording/post-record-publication';
import { deleteAllFrameAnnotationRasterJobs } from '../../composition/persistence/frame-annotation-raster-jobs';

const logger = createLogger({ namespace: 'OffscreenDocument' });
const OFFSCREEN_STARTUP_ID_PARAM = 'offscreenStartupId';
const PRIVACY_ERASURE_MODE_PARAM = 'privacyErasure';
const MISSING_OFFSCREEN_STARTUP_ID = 'missing-offscreen-startup-id';

function stringifyBootstrapError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function notifyOffscreenRuntimeFailure(
  error: unknown,
  offscreenStartupId: string
): Promise<void> {
  const message = stringifyBootstrapError(error);
  logger.error('Failed to init DB', error);

  try {
    await sendRuntimeMessage({
      type: VideoMessageType.OFFSCREEN_ERROR,
      error: message,
      offscreenStartupId,
      phase: 'runtime',
    });
  } catch (notifyError) {
    logger.error('Failed to notify runtime about offscreen bootstrap failure', notifyError);
  }
}

async function initializeOffscreenDb(offscreenStartupId: string): Promise<void> {
  await initDB();
  subscribeToDbTermination(() => {
    logger.warn('DB connection terminated, reinitializing offscreen DB');
    void initDB().catch((error) => {
      void notifyOffscreenRuntimeFailure(error, offscreenStartupId);
    });
  });
}

async function reconcileOffscreenRuntimeState(): Promise<void> {
  await deleteAllFrameAnnotationRasterJobs();
  await cleanupOrphanedRecordingStaging();
  await reconcileProjectExportJobs();
  await reconcileRecordingCompletionOutbox({ sendRuntimeMessage });
}

export function bootstrapOffscreenDocument(): void {
  const offscreenStartupId = resolveOffscreenStartupId();
  initTracer('off');
  logger.debug('Offscreen document loaded');
  const runtimeReady = isPrivacyErasureOffscreenDocument()
    ? Promise.resolve()
    : initializeOffscreenDb(offscreenStartupId).then(() => reconcileOffscreenRuntimeState());
  void runtimeReady
    .then(() =>
      sendRuntimeMessage({
        type: VideoMessageType.OFFSCREEN_READY,
        offscreenStartupId,
      })
    )
    .catch((error) => {
      void notifyOffscreenRuntimeFailure(error, offscreenStartupId);
    });
}

function isPrivacyErasureOffscreenDocument(): boolean {
  try {
    return new URL(globalThis.location.href).searchParams.get(PRIVACY_ERASURE_MODE_PARAM) === '1';
  } catch {
    return false;
  }
}

function resolveOffscreenStartupId(): string {
  try {
    const offscreenStartupId = new URL(globalThis.location.href).searchParams.get(
      OFFSCREEN_STARTUP_ID_PARAM
    );
    return offscreenStartupId && offscreenStartupId.length > 0
      ? offscreenStartupId
      : MISSING_OFFSCREEN_STARTUP_ID;
  } catch {
    return MISSING_OFFSCREEN_STARTUP_ID;
  }
}
