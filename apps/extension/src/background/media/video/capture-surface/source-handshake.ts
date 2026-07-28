// policyStateId: video-capture-surface-sessions
// Source waiters are bound to one recording generation and stream instance.
import type { ViewportInfo } from '@sniptale/runtime-contracts/video/types/types';
import type { RuntimeOffscreenSourceReadyMessage } from '../../../../contracts/messaging/contracts/types';
import { captureViewportsEqual, readTabCaptureViewport } from '../capture-viewport';
import { getVideoSurfaceSession } from './session-registry';

const SOURCE_READY_TIMEOUT_MS = 10_000;

type SourceReadyWaiter = {
  expectedStreamInstanceId: string;
  expectedViewport: ViewportInfo | null;
  reject: (reason: unknown) => void;
  resolve: (streamInstanceId: string) => void;
  tabId: number | null;
  timeout: ReturnType<typeof setTimeout>;
};

const readyWaiters = new Map<string, SourceReadyWaiter>();

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function rejectVideoSourceReady(
  recordingId: string,
  waiter: SourceReadyWaiter,
  reason: string
): 'DENY' {
  clearTimeout(waiter.timeout);
  readyWaiters.delete(recordingId);
  waiter.reject(new Error(reason));
  return 'DENY';
}

export async function acceptVideoSourceReady(
  message: RuntimeOffscreenSourceReadyMessage
): Promise<'ALLOW' | 'DENY'> {
  const session = getVideoSurfaceSession(message.recordingId);
  const waiter = readyWaiters.get(message.recordingId);
  if (!session || !waiter || message.generation !== session.generation || session.sourceReady) {
    return 'DENY';
  }
  if (
    message.streamInstanceId !== waiter.expectedStreamInstanceId ||
    session.streamInstanceId !== message.streamInstanceId
  ) {
    return 'DENY';
  }
  if (!isPositiveFinite(message.videoWidth) || !isPositiveFinite(message.videoHeight)) {
    return rejectVideoSourceReady(message.recordingId, waiter, 'source-dimensions-mismatch');
  }
  if (waiter.expectedViewport && waiter.tabId !== null) {
    try {
      const liveViewport = await readTabCaptureViewport(waiter.tabId);
      if (!captureViewportsEqual(waiter.expectedViewport, liveViewport)) {
        return rejectVideoSourceReady(
          message.recordingId,
          waiter,
          'The tab viewport changed while the recording source was opening'
        );
      }
    } catch (error) {
      return rejectVideoSourceReady(
        message.recordingId,
        waiter,
        error instanceof Error ? error.message : String(error)
      );
    }
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
  expectedViewport: ViewportInfo | null;
  recordingId: string;
  tabId: number | null;
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
      expectedViewport: args.expectedViewport,
      reject,
      resolve,
      tabId: args.tabId,
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
