// policyStateId: video-capture-surface-sessions
import { createLogger } from '@sniptale/platform/observability/logger';
import { createSecureRandomUuid } from '@sniptale/platform/security/secure-random-id';
import {
  setViewportOutputFrozen,
  type ViewportOutputStateResult,
} from '../../../capture-surface/output-state';
import { setVideoRecordingRuntimeState } from '../../session-state';
import { stopRecording } from '../controls.stop';

type ExactOutputBinding = {
  generation: number;
  recordingId: string;
  streamInstanceId: string;
};

type OperationResult = { ok: true } | { error: unknown; ok: false };

type CriticalOutputFailureResult = 'binding-changed' | 'compensated' | 'retained' | 'stopped';

const logger = createLogger({ namespace: 'BackgroundVideoExactOutputTransition' });

let exactOutputQueue: Promise<void> | null = null;

function observeOperation(work: Promise<void>): Promise<OperationResult> {
  return work.then(
    () => ({ ok: true }),
    (error: unknown) => ({ error, ok: false })
  );
}

function resolveErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function requireAppliedOutputState(
  binding: ExactOutputBinding,
  frozen: boolean,
  transitionId: string,
  onApplied: (frozen: boolean) => void
): Promise<void> {
  const result: ViewportOutputStateResult = await setViewportOutputFrozen(
    binding,
    frozen,
    transitionId
  );
  if (result !== 'applied') {
    throw new Error(
      `Tab output ${frozen ? 'freeze' : 'resume'} was superseded by another exact-output transition`
    );
  }
  onApplied(frozen);
}

export function createExactOutputTransitionId(message: string): string {
  return createSecureRandomUuid(message);
}

export function serializeExactOutputWork<T>(work: () => Promise<T> | T): Promise<T> {
  let queued: Promise<T>;
  if (exactOutputQueue) {
    queued = exactOutputQueue.then(work, work);
  } else {
    try {
      queued = Promise.resolve(work());
    } catch (error) {
      queued = Promise.reject(error);
    }
  }
  const tail = queued.then(
    () => undefined,
    () => undefined
  );
  exactOutputQueue = tail;
  void tail.then(() => {
    if (exactOutputQueue === tail) exactOutputQueue = null;
  });
  return queued;
}

export async function freezeExactOutput(args: {
  binding: ExactOutputBinding;
  isCurrent: () => boolean;
  onApplied: (frozen: boolean) => void;
  transitionId: string;
}): Promise<void> {
  const initial = await observeOperation(
    requireAppliedOutputState(args.binding, true, args.transitionId, args.onApplied)
  );
  if (initial.ok || !args.isCurrent()) return;
  logger.warn('Initial exact tab output freeze was not acknowledged; retrying', initial.error);
  const retry = await observeOperation(
    requireAppliedOutputState(args.binding, true, args.transitionId, args.onApplied)
  );
  if (retry.ok || !args.isCurrent()) return;
  throw new AggregateError(
    [initial.error, retry.error],
    'Exact tab output freeze could not be confirmed'
  );
}

export async function thawExactOutput(args: {
  binding: ExactOutputBinding;
  isCurrent: () => boolean;
  onApplied: (frozen: boolean) => void;
  transitionId: string;
}): Promise<void> {
  const initial = await observeOperation(
    requireAppliedOutputState(args.binding, false, args.transitionId, args.onApplied)
  );
  if (initial.ok || !args.isCurrent()) return;
  logger.warn('Initial exact tab output resume was not acknowledged; retrying', initial.error);
  const retry = await observeOperation(
    requireAppliedOutputState(args.binding, false, args.transitionId, args.onApplied)
  );
  if (!retry.ok) throw retry.error;
}

export async function stopAfterCriticalOutputFailure(args: {
  beforeStop?: () => void;
  compensate?: () => Promise<void>;
  error: unknown;
  isCurrent: () => boolean;
}): Promise<CriticalOutputFailureResult> {
  if (!args.isCurrent()) return 'binding-changed';
  args.beforeStop?.();
  const message = resolveErrorMessage(args.error);
  logger.error('Exact tab output recovery failed; stopping bound recording', args.error);
  setVideoRecordingRuntimeState({ error: message });

  try {
    const result = await stopRecording(false);
    if (result.result !== 'failed') return 'stopped';
    logger.error('Bound recording stop failed after exact output recovery failure', result.error);
  } catch (error) {
    logger.error('Bound recording stop threw after exact output recovery failure', error);
  }

  if (!args.isCurrent()) return 'binding-changed';
  if (!args.compensate) {
    logger.error('Exact output transition authority retained after rejected bound stop');
    return 'retained';
  }
  try {
    await args.compensate();
    return args.isCurrent() ? 'compensated' : 'binding-changed';
  } catch (error) {
    logger.error('Exact output transition authority retained after rejected stop and thaw', error);
    return 'retained';
  }
}

export function resetExactOutputTransitionForTests(): void {
  exactOutputQueue = null;
}
