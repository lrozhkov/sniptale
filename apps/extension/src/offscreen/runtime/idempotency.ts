import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { HandledOffscreenRuntimeMessageType } from './routing';

type CommandEntry = {
  completion: Promise<unknown>;
  reject(error: unknown): void;
  resolve(value: unknown): void;
};

type VoiceInputCommandMessageType =
  | typeof MessageType.OFFSCREEN_VOICE_INPUT_STATUS
  | typeof MessageType.OFFSCREEN_VOICE_INPUT_START
  | typeof MessageType.OFFSCREEN_VOICE_INPUT_STOP;

type OffscreenIdempotencyMessageType =
  | HandledOffscreenRuntimeMessageType
  | VoiceInputCommandMessageType;

type IdempotencyResult =
  | { duplicate: true; completion: Promise<unknown> }
  | { duplicate: false; completeWith(work: Promise<unknown>): Promise<unknown> }
  | { duplicate: false; tracked: false };

type OffscreenIdempotencyMessage = {
  desktopMediaRequestId?: unknown;
  generation?: unknown;
  jobId?: unknown;
  recordingId?: unknown;
  requestId?: unknown;
  reference?: unknown;
  sessionId?: unknown;
  streamInstanceId?: unknown;
  type: OffscreenIdempotencyMessageType;
};

type OffscreenCommandIdempotencyPolicy = {
  idempotent: boolean;
  reason: string;
};

const MAX_RETAINED_KEYS = 500;
const executedCommandKeys = new Map<string, CommandEntry>();

const idempotencyPolicyByType = {
  [MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE]: {
    idempotent: false,
    reason: 'privacy erasure and verification are deliberately repeatable under the owner lock',
  },
  [MessageType.OFFSCREEN_FRAME_ANNOTATION_RASTERIZE]: {
    idempotent: true,
    reason: 'frame annotation rasterization is correlated by the staged immutable job reference',
  },
  [MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME]: {
    idempotent: true,
    reason: 'one-shot desktop frame capture is correlated by requestId',
  },
  [MessageType.OFFSCREEN_WRITE_IMAGE_CLIPBOARD]: {
    idempotent: true,
    reason: 'clipboard write is correlated by requestId',
  },
  [VideoMessageType.GET_DESKTOP_MEDIA]: {
    idempotent: true,
    reason: 'desktop media prompt is correlated by desktopMediaRequestId',
  },
  [VideoMessageType.DISPOSE_DESKTOP_MEDIA]: {
    idempotent: false,
    reason: 'best-effort cleanup is intentionally repeatable',
  },
  [VideoMessageType.OFFSCREEN_START_RECORDING]: {
    idempotent: true,
    reason: 'recording startup is correlated by recordingId when present',
  },
  [VideoMessageType.OFFSCREEN_BEGIN_RECORDING]: {
    idempotent: true,
    reason: 'recording begin is bound to a recording and stream generation',
  },
  [VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE]: {
    idempotent: false,
    reason: 'the latest viewport draw state must be applied after every navigation',
  },
  [VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE]: {
    idempotent: false,
    reason: 'source revalidation is a read-like command',
  },
  [VideoMessageType.OFFSCREEN_STOP_RECORDING]: {
    idempotent: true,
    reason: 'recording stop is scoped to the active recording generation',
  },
  [VideoMessageType.OFFSCREEN_PAUSE_RECORDING]: {
    idempotent: true,
    reason: 'pause is scoped to the active recording generation',
  },
  [VideoMessageType.OFFSCREEN_RESUME_RECORDING]: {
    idempotent: true,
    reason: 'resume is scoped to the active recording generation',
  },
  [VideoMessageType.OFFSCREEN_UPDATE_SETTINGS]: {
    idempotent: false,
    reason: 'recording settings are a latest-value command',
  },
  [VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT]: {
    idempotent: true,
    reason: 'project export start is correlated by jobId',
  },
  [VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT]: {
    idempotent: true,
    reason: 'project export cancel is correlated by jobId',
  },
  [VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES]: {
    idempotent: false,
    reason: 'capability probing is read-like and owns its manual response',
  },
  [MessageType.OFFSCREEN_VOICE_INPUT_STATUS]: {
    idempotent: true,
    reason: 'status retries must replay the snapshot observed by the signed request',
  },
  [MessageType.OFFSCREEN_VOICE_INPUT_START]: {
    idempotent: true,
    reason: 'voice startup and its request-scoped snapshot are bound to one signed generation',
  },
  [MessageType.OFFSCREEN_VOICE_INPUT_STOP]: {
    idempotent: true,
    reason:
      'voice stop and its exact stale or accepted response are bound to one signed generation',
  },
} as const satisfies Record<OffscreenIdempotencyMessageType, OffscreenCommandIdempotencyPolicy>;

export const OFFSCREEN_COMMAND_CORRELATION_KEYS = [
  'jobId',
  'recordingId',
  'desktopMediaRequestId',
  'requestId',
  'sessionId',
  'runtime',
] as const;

export function getOffscreenCommandIdempotencyPolicy(
  type: OffscreenIdempotencyMessageType
): OffscreenCommandIdempotencyPolicy {
  return idempotencyPolicyByType[type];
}

function readCorrelationId(message: OffscreenIdempotencyMessage): string {
  if (
    typeof message.reference === 'object' &&
    message.reference !== null &&
    !Array.isArray(message.reference) &&
    typeof (message.reference as Record<string, unknown>)['jobId'] === 'string'
  ) {
    return (message.reference as Record<string, string>)['jobId']!;
  }
  if (typeof message.jobId === 'string' && message.jobId.length > 0) {
    return message.jobId;
  }
  if (typeof message.recordingId === 'string' && message.recordingId.length > 0) {
    return message.recordingId;
  }
  if (
    typeof message.desktopMediaRequestId === 'string' &&
    message.desktopMediaRequestId.length > 0
  ) {
    return message.desktopMediaRequestId;
  }
  if (typeof message.requestId === 'string' && message.requestId.length > 0) {
    return message.requestId;
  }
  if (typeof message.sessionId === 'string' && message.sessionId.length > 0) {
    return message.sessionId;
  }

  return 'runtime';
}

function pruneExecutedCommandKeys(): void {
  if (executedCommandKeys.size <= MAX_RETAINED_KEYS) {
    return;
  }

  const oldestKey = executedCommandKeys.keys().next().value;
  if (oldestKey !== undefined) {
    executedCommandKeys.delete(oldestKey);
  }
}

function createIdempotencyKey(args: {
  capabilityGeneration: string;
  message: OffscreenIdempotencyMessage;
}): string {
  const jobId = readCorrelationId(args.message);
  return JSON.stringify({
    commandType: args.message.type,
    capabilityGeneration: args.capabilityGeneration,
    recordingGeneration:
      typeof args.message.generation === 'number' ? args.message.generation : null,
    streamInstanceId:
      typeof args.message.streamInstanceId === 'string' ? args.message.streamInstanceId : null,
    jobId,
  });
}

export function markOffscreenSideEffectCommand(args: {
  capabilityGeneration: string;
  message: OffscreenIdempotencyMessage;
}): IdempotencyResult {
  if (!getOffscreenCommandIdempotencyPolicy(args.message.type).idempotent) {
    return { duplicate: false, tracked: false };
  }

  const key = createIdempotencyKey(args);
  const existing = executedCommandKeys.get(key);
  if (existing) {
    return { duplicate: true, completion: existing.completion };
  }

  let resolveEntry: ((value?: unknown) => void) | undefined;
  let rejectEntry: ((error: unknown) => void) | undefined;
  const completion = new Promise<unknown>((resolve, reject) => {
    resolveEntry = resolve;
    rejectEntry = reject;
  });
  completion.catch(() => undefined);

  const entry: CommandEntry = {
    completion,
    reject: (error) => rejectEntry?.(error),
    resolve: (value) => resolveEntry?.(value),
  };
  executedCommandKeys.set(key, entry);
  pruneExecutedCommandKeys();

  return {
    duplicate: false,
    completeWith: (work) => {
      void work.then(
        (value) => entry.resolve(value),
        (error) => {
          executedCommandKeys.delete(key);
          entry.reject(error);
        }
      );
      return work;
    },
  };
}

export function executeOffscreenResponseCommand<TResponse>(args: {
  capabilityGeneration: string;
  execute(): TResponse;
  message: OffscreenIdempotencyMessage;
}):
  | { duplicate: true; completion: Promise<TResponse> }
  | { duplicate: false; response: TResponse } {
  const idempotency = markOffscreenSideEffectCommand(args);
  if (idempotency.duplicate) {
    return {
      duplicate: true,
      completion: idempotency.completion as Promise<TResponse>,
    };
  }

  try {
    const response = args.execute();
    if (!('tracked' in idempotency)) {
      void idempotency.completeWith(Promise.resolve(response));
    }
    return { duplicate: false, response };
  } catch (error) {
    if (!('tracked' in idempotency)) {
      void idempotency.completeWith(Promise.reject(error));
    }
    throw error;
  }
}
