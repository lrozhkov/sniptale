// policyStateId: video-capture-surface-sessions
// Source waiters are bound to one recording generation and stream instance.
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { createSecureRandomUuid } from '@sniptale/platform/security/secure-random-id';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { ViewportInfo } from '@sniptale/runtime-contracts/video/types/types';
import type { RuntimeOffscreenSourceReadyMessage } from '../../../../contracts/messaging/contracts/types';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import { captureViewportsEqual, readTabCaptureViewport } from '../capture-viewport';
import { setViewportOutputFrozen } from './output-state';
import { getVideoSurfaceSession } from './session-registry';

const SOURCE_READY_TIMEOUT_MS = 10_000;

type SourceReadyWaiter = {
  admissionStarted: boolean;
  expectedStreamInstanceId: string;
  expectedViewport: ViewportInfo | null;
  reject: (reason: unknown) => void;
  resolve: (streamInstanceId: string) => void;
  tabId: number | null;
  timeout: ReturnType<typeof setTimeout>;
  viewportMismatchPolicy: 'reject' | 'remap';
};

type VideoSurfaceSession = NonNullable<ReturnType<typeof getVideoSurfaceSession>>;

const readyWaiters = new Map<string, SourceReadyWaiter>();

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function rejectVideoSourceReady(
  recordingId: string,
  waiter: SourceReadyWaiter,
  reason: string
): 'DENY' {
  if (readyWaiters.get(recordingId) !== waiter) return 'DENY';
  clearTimeout(waiter.timeout);
  readyWaiters.delete(recordingId);
  waiter.reject(new Error(reason));
  return 'DENY';
}

function requireAppliedOutputState(result: 'applied' | 'stale', action: string): void {
  if (result !== 'applied') {
    throw new Error(`Starting crop output ${action} was superseded`);
  }
}

function isCurrentSourceAdmission(
  message: RuntimeOffscreenSourceReadyMessage,
  waiter: SourceReadyWaiter,
  session: VideoSurfaceSession
): boolean {
  return (
    readyWaiters.get(message.recordingId) === waiter &&
    getVideoSurfaceSession(message.recordingId) === session &&
    message.generation === session.generation &&
    message.streamInstanceId === waiter.expectedStreamInstanceId &&
    session.streamInstanceId === message.streamInstanceId &&
    !session.sourceReady
  );
}

async function remapStartingCropSource(args: {
  liveViewport: ViewportInfo;
  message: RuntimeOffscreenSourceReadyMessage;
}): Promise<{ height: number; width: number }> {
  const binding = {
    generation: args.message.generation,
    recordingId: args.message.recordingId,
    streamInstanceId: args.message.streamInstanceId,
  };
  const transitionId = createSecureRandomUuid(
    'Secure starting crop transition generation is unavailable'
  );
  requireAppliedOutputState(await setViewportOutputFrozen(binding, true, transitionId), 'freeze');

  let remapError: unknown = null;
  try {
    const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
      attachOffscreenCommandCapability({
        type: VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE,
        ...binding,
        transitionId,
        viewport: args.liveViewport,
      })
    );
    const remappedWidth = response?.videoWidth;
    const remappedHeight = response?.videoHeight;
    if (
      response?.success !== true ||
      response.result !== 'ALLOW' ||
      !isPositiveFinite(remappedWidth) ||
      !isPositiveFinite(remappedHeight)
    ) {
      throw new Error(response?.error ?? 'Starting crop source remapping failed');
    }
    return { height: remappedHeight, width: remappedWidth };
  } catch (error) {
    remapError = error;
    throw error;
  } finally {
    try {
      requireAppliedOutputState(
        await setViewportOutputFrozen(binding, false, transitionId),
        'resume'
      );
    } catch (resumeError) {
      if (remapError) {
        throw new AggregateError(
          [remapError, resumeError],
          'Starting crop remap failed and its output could not resume',
          { cause: resumeError }
        );
      }
      throw resumeError;
    }
  }
}

async function resolveAcceptedSourceSize(
  message: RuntimeOffscreenSourceReadyMessage,
  waiter: SourceReadyWaiter,
  session: VideoSurfaceSession
): Promise<{ height: number; width: number }> {
  const initialSize = { height: message.videoHeight, width: message.videoWidth };
  if (!waiter.expectedViewport || waiter.tabId === null) return initialSize;

  const liveViewport = await readTabCaptureViewport(waiter.tabId);
  if (!isCurrentSourceAdmission(message, waiter, session)) {
    throw new Error('Recording source admission is no longer current');
  }
  if (captureViewportsEqual(waiter.expectedViewport, liveViewport)) return initialSize;
  if (waiter.viewportMismatchPolicy !== 'remap') {
    throw new Error('The tab viewport changed while the recording source was opening');
  }
  return remapStartingCropSource({ liveViewport, message });
}

export async function acceptVideoSourceReady(
  message: RuntimeOffscreenSourceReadyMessage
): Promise<'ALLOW' | 'DENY'> {
  const session = getVideoSurfaceSession(message.recordingId);
  const waiter = readyWaiters.get(message.recordingId);
  if (
    !session ||
    !waiter ||
    waiter.admissionStarted ||
    !isCurrentSourceAdmission(message, waiter, session)
  ) {
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
  waiter.admissionStarted = true;
  let sourceSize: { height: number; width: number };
  try {
    sourceSize = await resolveAcceptedSourceSize(message, waiter, session);
  } catch (error) {
    return rejectVideoSourceReady(
      message.recordingId,
      waiter,
      error instanceof Error ? error.message : String(error)
    );
  }
  if (!isCurrentSourceAdmission(message, waiter, session)) {
    return 'DENY';
  }
  session.sourceReady = true;
  session.sourceVideoHeight = sourceSize.height;
  session.sourceVideoWidth = sourceSize.width;
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
  viewportMismatchPolicy?: 'reject' | 'remap';
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
      admissionStarted: false,
      expectedStreamInstanceId: args.expectedStreamInstanceId,
      expectedViewport: args.expectedViewport,
      reject,
      resolve,
      tabId: args.tabId,
      timeout,
      viewportMismatchPolicy: args.viewportMismatchPolicy ?? 'reject',
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
