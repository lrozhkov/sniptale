// policyStateId: video-capture-surface-sessions
// Source waiters are bound to one recording generation and stream instance.
import type { RuntimeOffscreenSourceReadyMessage } from '../../../../contracts/messaging/contracts/types';
import { getVideoSurfaceSession } from './session-registry';

const SOURCE_READY_TIMEOUT_MS = 10_000;

type SourceReadyWaiter = {
  expectedStreamInstanceId: string;
  reject: (reason: unknown) => void;
  resolve: (streamInstanceId: string) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const readyWaiters = new Map<string, SourceReadyWaiter>();

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export async function acceptVideoSourceReady(
  message: RuntimeOffscreenSourceReadyMessage
): Promise<'ALLOW' | 'DENY'> {
  const session = getVideoSurfaceSession(message.recordingId);
  const waiter = readyWaiters.get(message.recordingId);
  if (
    !session ||
    !waiter ||
    message.generation !== session.generation ||
    message.streamInstanceId !== waiter.expectedStreamInstanceId ||
    session.streamInstanceId !== message.streamInstanceId ||
    session.sourceReady
  ) {
    return 'DENY';
  }
  if (!isPositiveFinite(message.videoWidth) || !isPositiveFinite(message.videoHeight)) {
    clearTimeout(waiter.timeout);
    readyWaiters.delete(message.recordingId);
    waiter.reject(new Error('Recording source reported invalid dimensions'));
    return 'DENY';
  }
  session.sourceReady = true;
  session.sourceVideoHeight = message.videoHeight;
  session.sourceVideoWidth = message.videoWidth;
  clearTimeout(waiter.timeout);
  readyWaiters.delete(message.recordingId);
  waiter.resolve(message.streamInstanceId);
  return 'ALLOW';
}

export function waitForVideoSourceReady(args: {
  expectedStreamInstanceId: string;
  recordingId: string;
}): Promise<string> {
  const session = getVideoSurfaceSession(args.recordingId);
  if (!session) return Promise.reject(new Error('Video surface session is missing'));
  session.streamInstanceId = args.expectedStreamInstanceId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      readyWaiters.delete(args.recordingId);
      reject(new Error('Timed out while validating the recording source'));
    }, SOURCE_READY_TIMEOUT_MS);
    readyWaiters.set(args.recordingId, {
      expectedStreamInstanceId: args.expectedStreamInstanceId,
      reject,
      resolve,
      timeout,
    });
  });
}

export function cancelVideoSourceReadyWait(recordingId: string, reason: unknown): void {
  const waiter = readyWaiters.get(recordingId);
  if (!waiter) return;
  clearTimeout(waiter.timeout);
  readyWaiters.delete(recordingId);
  waiter.reject(reason);
}
