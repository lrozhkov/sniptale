import type {
  VoiceHistoryEntry,
  VoiceHistoryScope,
  VoiceInputErrorCode,
  VoiceInputPreferences,
} from '@sniptale/runtime-contracts/voice-input';
import type { VoiceInputHistory } from '../../composition/persistence/voice-input-history';
import {
  acquireMediaMutationPermit,
  getMediaAuthorityGeneration,
} from '../mutation-exclusion/media-activity';
import { getVoiceInputProcessingErrorCode, type createVoiceInputProcessor } from './processing';

export class VoiceProcessingError extends Error {
  constructor(
    readonly code: VoiceInputErrorCode,
    readonly scope: VoiceHistoryScope,
    readonly rawTranscript?: string
  ) {
    super(code);
  }
}

type Flight = {
  owner: object;
  initialScope: VoiceHistoryScope;
  scope: VoiceHistoryScope;
  controller: AbortController;
  cancelled: boolean;
  completion: Promise<VoiceHistoryEntry>;
};

function sameAudio(left: VoiceHistoryScope, right: VoiceHistoryScope): boolean {
  return (
    left.entryId === right.entryId &&
    left.incarnation === right.incarnation &&
    left.epoch === right.epoch &&
    left.audioDigest === right.audioDigest
  );
}

export function voiceProcessingErrorCode(error: unknown): VoiceInputErrorCode {
  return error instanceof VoiceProcessingError
    ? error.code
    : getVoiceInputProcessingErrorCode(error);
}

function flightErrorCode(flight: Flight, error: unknown): VoiceInputErrorCode {
  if (flight.cancelled) return 'aborted';
  if (!flight.controller.signal.aborted) return voiceProcessingErrorCode(error);
  const reason: unknown = flight.controller.signal.reason;
  return reason instanceof Error && reason.message === 'timeout' ? 'timeout' : 'aborted';
}

function canRecoverTranscript(flight: Flight, code: VoiceInputErrorCode): boolean {
  return (
    !flight.cancelled &&
    (!flight.controller.signal.aborted || code === 'timeout') &&
    code !== 'stale' &&
    code !== 'privacy-erasure-in-progress'
  );
}

/** Owns cancellation and drain for both dictation and explicit history retry. */
export function createVoiceInputProcessingOperations(deps: {
  history: VoiceInputHistory;
  processor: ReturnType<typeof createVoiceInputProcessor>;
  acquirePermit?: typeof acquireMediaMutationPermit;
  getGeneration?: () => number;
}) {
  const flights = new Set<Flight>();
  const acquirePermit = deps.acquirePermit ?? acquireMediaMutationPermit;
  const getGeneration = deps.getGeneration ?? getMediaAuthorityGeneration;

  function assertEgressAuthority(flight: Flight, generation: number): void {
    flight.controller.signal.throwIfAborted();
    const fresh = acquirePermit();
    if (!fresh) throw new Error('privacy-erasure-in-progress');
    fresh();
    if (getGeneration() !== generation) throw new Error('stale');
  }

  async function recoverTranscript(
    flight: Flight,
    code: VoiceInputErrorCode,
    rawTranscript: string | undefined,
    generation: number
  ): Promise<string | undefined> {
    if (rawTranscript === undefined || !canRecoverTranscript(flight, code)) return undefined;
    try {
      await deps.history.get(flight.scope);
      const fresh = acquirePermit();
      if (!fresh) return undefined;
      fresh();
      if (getGeneration() !== generation || !canRecoverTranscript(flight, code)) return undefined;
      return rawTranscript;
    } catch {
      // Deleted or replaced audio cannot deliver text.
      return undefined;
    }
  }

  function run(args: {
    owner: object;
    scope: VoiceHistoryScope;
    preferences: VoiceInputPreferences;
    browserTranscript?: string;
    onPhase?(phase: 'processing-asr' | 'processing-text', scope: VoiceHistoryScope): void;
  }): Promise<VoiceHistoryEntry> {
    if ([...flights].some((flight) => sameAudio(flight.scope, args.scope)))
      return Promise.reject(new VoiceProcessingError('busy-speech', args.scope));
    const permit = acquirePermit();
    if (!permit)
      return Promise.reject(new VoiceProcessingError('privacy-erasure-in-progress', args.scope));
    const generation = getGeneration();
    permit();
    const controller = new AbortController();
    const flight: Flight = {
      owner: args.owner,
      initialScope: args.scope,
      scope: args.scope,
      controller,
      cancelled: false,
      completion: Promise.resolve().then(() => execute()),
    };
    let rawTranscript: string | undefined;
    const timeout = globalThis.setTimeout(() => controller.abort(new Error('timeout')), 120_000);
    flights.add(flight);

    async function execute(): Promise<VoiceHistoryEntry> {
      try {
        const entry = await deps.processor.run({
          scope: args.scope,
          preferences: args.preferences,
          ...(args.browserTranscript === undefined
            ? {}
            : { browserTranscript: args.browserTranscript }),
          signal: controller.signal,
          beforeSend: async () => assertEgressAuthority(flight, generation),
          onScope: (scope) => {
            flight.scope = scopeOf(scope);
          },
          onPhase: (phase, scope) => {
            flight.scope = scopeOf(scope);
            if (!controller.signal.aborted) args.onPhase?.(phase, scopeOf(scope));
          },
          onRawTranscript: (text, scope) => {
            rawTranscript = text;
            flight.scope = scopeOf(scope);
          },
        });
        controller.signal.throwIfAborted();
        flight.scope = scopeOf(entry);
        return entry;
      } catch (error) {
        const code = flightErrorCode(flight, error);
        const recoverable = await recoverTranscript(flight, code, rawTranscript, generation);
        throw new VoiceProcessingError(
          flight.cancelled ? 'aborted' : code,
          flight.scope,
          flight.cancelled ? undefined : recoverable
        );
      } finally {
        globalThis.clearTimeout(timeout);
        flights.delete(flight);
      }
    }
    return flight.completion;
  }

  async function cancel(selected: Flight[]): Promise<void> {
    for (const flight of selected) {
      // AbortSignal.reason is immutable: explicit Cancel must still override an earlier deadline.
      flight.cancelled = true;
      flight.controller.abort();
    }
    await Promise.allSettled(selected.map((flight) => flight.completion));
  }

  return {
    run,
    async cancelOwner(owner: object) {
      await cancel([...flights].filter((flight) => flight.owner === owner));
    },
    async cancelScope(scope: VoiceHistoryScope): Promise<VoiceHistoryScope> {
      const selected = [...flights].filter((flight) => sameAudio(flight.scope, scope));
      await cancel(selected);
      return selected.at(-1)?.scope ?? scope;
    },
    async abortAndDrain() {
      await cancel([...flights]);
    },
  };
}

function scopeOf(entry: VoiceHistoryScope): VoiceHistoryScope {
  return {
    entryId: entry.entryId,
    incarnation: entry.incarnation,
    epoch: entry.epoch,
    revision: entry.revision,
    audioDigest: entry.audioDigest,
  };
}
export type VoiceInputProcessingOperations = ReturnType<
  typeof createVoiceInputProcessingOperations
>;
