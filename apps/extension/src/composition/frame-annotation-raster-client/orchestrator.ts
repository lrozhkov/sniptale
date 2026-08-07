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
const PREPARE_TIMEOUT_MS = 15_000;
const RASTER_RESPONSE_TIMEOUT_MS = 65_000;
const CANCEL_TIMEOUT_MS = 3_000;
const CLEANUP_TIMEOUT_MS = 3_000;

export type FrameAnnotationRasterTransitionOptions = {
  signal?: AbortSignal;
  input: FrameAnnotationRasterInput;
  isCurrent?: () => boolean;
  transport: Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'>;
};

/** Owns the prepare, rasterize and cancellation transition for one staged raster job. */
export async function runFrameAnnotationRasterTransition(
  options: FrameAnnotationRasterTransitionOptions
): Promise<{ blob: Blob; metadata: FrameAnnotationRasterOutputMetadata }> {
  return runWithPersistenceMutationTransition(() => runAdmittedRasterTransition(options));
}

async function runAdmittedRasterTransition(
  options: FrameAnnotationRasterTransitionOptions
): Promise<{ blob: Blob; metadata: FrameAnnotationRasterOutputMetadata }> {
  const leaseId = crypto.randomUUID();
  let reference: Awaited<ReturnType<typeof stageFrameAnnotationRasterJob>> | null = null;
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
    const cleanup = reference
      ? withTimeout(
          deleteFrameAnnotationRasterJob(reference.jobId),
          CLEANUP_TIMEOUT_MS,
          'Frame annotation raster cleanup timed out'
        )
      : Promise.resolve();
    const cancellation = withTimeout(
      options.transport.sendRuntimeMessage({
        type: MessageType.FRAME_ANNOTATION_RASTERIZE,
        operation: 'cancel',
        leaseId,
      }),
      CANCEL_TIMEOUT_MS,
      'Frame annotation raster cancellation timed out'
    );
    await Promise.allSettled([cleanup, cancellation]);
  }
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutResult = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([work, timeoutResult]).finally(() => clearTimeout(timeout));
}
