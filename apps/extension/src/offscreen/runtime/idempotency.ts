import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { HandledOffscreenRuntimeMessageType } from './routing';

type CommandEntry = {
  completion: Promise<void>;
  reject(error: unknown): void;
  resolve(): void;
};

type IdempotencyResult =
  | { duplicate: true; completion: Promise<void> }
  | { duplicate: false; completeWith(work: Promise<void>): Promise<void> }
  | { duplicate: false; tracked: false };

type OffscreenIdempotencyMessage = {
  desktopMediaRequestId?: unknown;
  jobId?: unknown;
  recordingId?: unknown;
  type: HandledOffscreenRuntimeMessageType;
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
  [VideoMessageType.OFFSCREEN_UPDATE_VIEWPORT_CROP]: {
    idempotent: false,
    reason: 'viewport crop is a latest-value command',
  },
  [VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE]: {
    idempotent: false,
    reason: 'draw state is a latest-value command keyed by navigationEpoch in the owner',
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
} as const satisfies Record<HandledOffscreenRuntimeMessageType, OffscreenCommandIdempotencyPolicy>;

export const OFFSCREEN_COMMAND_CORRELATION_KEYS = [
  'jobId',
  'recordingId',
  'desktopMediaRequestId',
  'runtime',
] as const;

export function getOffscreenCommandIdempotencyPolicy(
  type: HandledOffscreenRuntimeMessageType
): OffscreenCommandIdempotencyPolicy {
  return idempotencyPolicyByType[type];
}

function readCorrelationId(message: OffscreenIdempotencyMessage): string {
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
    generation: args.capabilityGeneration,
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

  let resolveEntry: (() => void) | undefined;
  let rejectEntry: ((error: unknown) => void) | undefined;
  const completion = new Promise<void>((resolve, reject) => {
    resolveEntry = resolve;
    rejectEntry = reject;
  });
  completion.catch(() => undefined);

  const entry: CommandEntry = {
    completion,
    reject: (error) => rejectEntry?.(error),
    resolve: () => resolveEntry?.(),
  };
  executedCommandKeys.set(key, entry);
  pruneExecutedCommandKeys();

  return {
    duplicate: false,
    completeWith: (work) => {
      void work.then(
        () => entry.resolve(),
        (error) => {
          executedCommandKeys.delete(key);
          entry.reject(error);
        }
      );
      return work;
    },
  };
}
