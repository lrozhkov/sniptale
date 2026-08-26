import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  consumeFrameAnnotationRasterOutput,
  deleteFrameAnnotationRasterJob,
  stageFrameAnnotationRasterJob,
  type FrameAnnotationRasterInput,
  type FrameAnnotationRasterOutputMetadata,
} from '../persistence/frame-annotation-raster-jobs';
import type { RuntimeMessagingTransport } from '../../platform/runtime-messaging';
import { runWithPersistenceMutationTransition } from '../persistence/infrastructure/mutation-barrier';

let nextRasterRevision = 1;
// The client transport stays wider than the background lease's 35 s cold-start budget.
const PREPARE_TIMEOUT_MS = 40_000;
const CONFIRM_TIMEOUT_MS = 3_000;
const RASTER_RESPONSE_TIMEOUT_MS = 65_000;
const CANCEL_TIMEOUT_MS = 3_000;
const CLEANUP_TIMEOUT_MS = 3_000;

export type FrameAnnotationRasterTransitionOptions = {
  signal?: AbortSignal;
  input: FrameAnnotationRasterInput;
  isCurrent?: () => boolean;
  transport: Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'>;
};

/** Owns offscreen preparation, the admitted staged raster job, and correlated cancellation. */
export async function runFrameAnnotationRasterTransition(
  options: FrameAnnotationRasterTransitionOptions
): Promise<{ blob: Blob; metadata: FrameAnnotationRasterOutputMetadata }> {
  const leaseId = crypto.randomUUID();
  try {
    const prepare = await withTimeout(
      options.transport.sendRuntimeMessage({
        type: MessageType.FRAME_ANNOTATION_RASTERIZE,
        operation: 'prepare',
        leaseId,
      }),
      PREPARE_TIMEOUT_MS,
      'Frame annotation raster preparation timed out'
    );
    if (!prepare.success || prepare.result !== leaseId) {
      throw new Error(prepare.error ?? 'Frame annotation raster preparation failed');
    }
    return await runWithPersistenceMutationTransition(() =>
      runAdmittedRasterTransition(options, leaseId)
    );
  } finally {
    await Promise.allSettled([
      withTimeout(
        options.transport.sendRuntimeMessage({
          type: MessageType.FRAME_ANNOTATION_RASTERIZE,
          operation: 'cancel',
          leaseId,
        }),
        CANCEL_TIMEOUT_MS,
        'Frame annotation raster cancellation timed out'
      ),
    ]);
  }
}

async function runAdmittedRasterTransition(
  options: FrameAnnotationRasterTransitionOptions,
  leaseId: string
): Promise<{ blob: Blob; metadata: FrameAnnotationRasterOutputMetadata }> {
  let reference: Awaited<ReturnType<typeof stageFrameAnnotationRasterJob>> | null = null;
  try {
    const confirmation = await withTimeout(
      options.transport.sendRuntimeMessage({
        type: MessageType.FRAME_ANNOTATION_RASTERIZE,
        operation: 'confirm',
        leaseId,
      }),
      CONFIRM_TIMEOUT_MS,
      'Frame annotation raster lease confirmation timed out'
    );
    if (!confirmation.success || confirmation.result !== leaseId) {
      throw new Error(confirmation.error ?? 'Frame annotation raster lease is no longer active');
    }
    reference = await stageFrameAnnotationRasterJob({
      jobId: leaseId,
      revision: nextRasterRevision++,
      input: options.input,
    });
    options.signal?.throwIfAborted();
    const response = await withTimeout(
      options.transport.sendRuntimeMessage({
        type: MessageType.FRAME_ANNOTATION_RASTERIZE,
        operation: 'rasterize',
        reference,
      }),
      RASTER_RESPONSE_TIMEOUT_MS,
      'Frame annotation rasterization timed out'
    );
    if (!response.success) {
      throw new Error(response.error ?? 'Frame annotation rasterization failed');
    }
    options.signal?.throwIfAborted();
    if (options.isCurrent && !options.isCurrent()) {
      throw new Error('Frame annotation raster result is stale');
    }
    return await consumeFrameAnnotationRasterOutput(reference);
  } finally {
    if (reference) {
      await Promise.allSettled([
        withTimeout(
          deleteFrameAnnotationRasterJob(reference.jobId),
          CLEANUP_TIMEOUT_MS,
          'Frame annotation raster cleanup timed out'
        ),
      ]);
    }
  }
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutResult = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([work, timeoutResult]).finally(() => clearTimeout(timeout));
}
