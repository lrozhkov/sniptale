import { withVoiceoverAttachmentLock } from '../../composition/persistence/projects/voiceover-publication-lock';
import type { ReviewOperation } from '../../features/video/review/types';
import { parseReviewOperation } from '../../features/video/review/validation';
import { prepareReviewAudio, type PreparedReviewAudio } from './audio-import';
import {
  assertReviewTextTakeBasis,
  prepareReviewTextTakeContent,
  type ReviewTextTakeOptions,
  type ReviewTextTakePreview,
} from './text-take';
import type { createVideoReviewSession } from './session';

type Session = ReturnType<typeof createVideoReviewSession>;
type Entry = { preview: ReviewTextTakePreview; filename: string };
type Prepared = { entry: Entry; audio: PreparedReviewAudio };
type Attempt = {
  session: Session;
  identity: string;
  entries: readonly Entry[];
  originals: readonly Entry[];
  options: ReviewTextTakeOptions;
  id: string;
  at: number;
  prepared: Prepared[];
  published: Set<PreparedReviewAudio>;
  operation?: Extract<ReviewOperation, { target: 'advancedContent' }>;
  baseRevision?: number;
  accepted: boolean;
  flushed: boolean;
  compensationPending: boolean;
  running?: Promise<void>;
};
// Preview lifetime bounds retry state; no persistent batch marker or second byte authority.
const attempts = new WeakMap<ReviewTextTakePreview, Attempt>();

function identity(entries: readonly Entry[], options?: ReviewTextTakeOptions) {
  return JSON.stringify([entries.map(({ preview }) => preview.clipId), !!options?.muteSource]);
}

function pending(attempt: Attempt) {
  return attempt.accepted
    ? attempt.prepared.some(({ audio }) => !attempt.published.has(audio))
    : !!attempt.running ||
        attempt.compensationPending ||
        attempt.prepared.length > 0 ||
        !!attempt.operation;
}

/** UI freezes only unfinished publication or ambiguous acceptance, never a proven empty refusal. */
export function reviewTextTakeBatchPending(
  session: Session,
  previews: readonly ReviewTextTakePreview[]
) {
  return previews.some((preview) => {
    const attempt = attempts.get(preview);
    return attempt?.session === session && pending(attempt);
  });
}

/** One authored operation accepts the entire selection; retry only finishes its own publication. */
export async function applyReviewTextTakeBatch(args: {
  session: Session;
  entries: readonly Entry[];
  signal: AbortSignal;
  options?: ReviewTextTakeOptions | undefined;
}): Promise<void> {
  const { session, entries, signal } = args;
  signal.throwIfAborted();
  if (
    !entries.length ||
    new Set(entries.map(({ preview }) => preview.clipId)).size !== entries.length
  )
    throw new Error('invalid-request');
  const known = [
    ...new Set(
      entries
        .map(({ preview }) => attempts.get(preview))
        .filter((value): value is Attempt => value !== undefined)
    ),
  ];
  const previous = known[0];
  const reusable =
    previous &&
    entries.every(({ preview }) => attempts.get(preview) === previous) &&
    (previous.accepted || previous.identity === identity(entries, args.options));
  if (
    known.some((attempt) => attempt.session !== session) ||
    (!reusable && known.some((attempt) => attempt.accepted || pending(attempt)))
  )
    throw new Error('stale');
  let attempt: Attempt;
  if (previous && reusable) {
    attempt = previous;
  } else {
    attempt = {
      session,
      identity: identity(entries, args.options),
      originals: [...entries],
      entries: entries.map((entry) => ({
        ...entry,
        preview: {
          ...entry.preview,
          textSnapshot: structuredClone(entry.preview.textSnapshot),
        },
      })),
      options: { ...args.options },
      id: crypto.randomUUID(),
      at: Date.now(),
      prepared: [],
      published: new Set(),
      accepted: false,
      flushed: false,
      compensationPending: false,
    };
    for (const { preview } of entries) attempts.set(preview, attempt);
  }
  if (!attempt.running) {
    const current = attempt;
    current.running = execute(current, signal).finally(() => {
      delete current.running;
    });
  }
  await attempt.running;
}

async function withAttachments<T>(prepared: readonly Prepared[], operation: () => Promise<T>) {
  const ids = [...new Set(prepared.map(({ audio }) => audio.assetId))].sort();
  const lock = (index: number): Promise<T> =>
    index === ids.length
      ? operation()
      : withVoiceoverAttachmentLock(ids[index]!, () => lock(index + 1));
  return lock(0);
}

function assertBases(attempt: Attempt) {
  for (const { preview } of attempt.entries) assertReviewTextTakeBasis(attempt.session, preview);
  const audio = attempt.session.getSnapshot().document.advancedContent.audio;
  if (
    audio.voiceover.length + attempt.entries.length > 512 ||
    (attempt.options.muteSource &&
      (!attempt.options.sourceAudioAvailable?.() ||
        (audio.original.mutes?.length ?? 0) + attempt.entries.length > 512))
  )
    throw new Error('invalid-request');
}

async function recover(attempt: Attempt) {
  if (!attempt.operation || attempt.baseRevision === undefined) return false;
  const accepted = await attempt.session.recoverDurableOperation(
    attempt.operation,
    attempt.baseRevision,
    { kind: 'voiceover-takes' }
  );
  if (accepted) attempt.accepted = true;
  return accepted;
}

async function prepareAndCommit(attempt: Attempt, signal: AbortSignal) {
  if (await recover(attempt)) return;
  if (!attempt.flushed) {
    await attempt.session.flush();
    attempt.flushed = true;
  }
  signal.throwIfAborted();
  assertBases(attempt);
  for (const [index, entry] of attempt.entries.entries()) {
    if (attempt.prepared.some((value) => value.entry === entry)) continue;
    const audio = await prepareReviewAudio(
      new File([entry.preview.blob], entry.filename, { type: entry.preview.blob.type }),
      signal,
      {
        aggregateId: attempt.session.getSnapshot().snapshot.workspace.aggregateId,
        clipId: entry.preview.clipId,
      }
    );
    attempt.prepared.push({ entry, audio });
    attempt.originals[index]!.preview.publication = audio;
    signal.throwIfAborted();
    assertBases(attempt);
  }
  await withAttachments(attempt.prepared, async () => {
    for (const { audio } of attempt.prepared) {
      signal.throwIfAborted();
      await audio.protect();
    }
    signal.throwIfAborted();
    assertBases(attempt);
    if (!attempt.operation) {
      const operation = parseReviewOperation(
        {
          id: attempt.id,
          at: attempt.at,
          target: 'advancedContent' as const,
          ...prepareReviewTextTakeContent(
            attempt.session,
            attempt.prepared.map(({ entry, audio }) => ({
              preview: entry.preview,
              assetId: audio.assetId,
              duration: audio.duration,
            })),
            attempt.options
          ),
        },
        attempt.session.getSnapshot().snapshot.workspace.source.duration
      );
      if (!operation || operation.target !== 'advancedContent') throw new Error('invalid-request');
      attempt.operation = operation;
    }
    await attempt.session.commitDurable(attempt.operation, (revision) => {
      attempt.baseRevision = revision;
    });
    attempt.accepted = true;
  });
}

async function compensate(attempt: Attempt) {
  attempt.compensationPending = true;
  // Called only after nonacceptance is known; cancelled bytes cannot remain in a retry payload.
  delete attempt.operation;
  delete attempt.baseRevision;
  await withAttachments(attempt.prepared, async () => {
    for (const prepared of attempt.prepared) {
      let referenced = true;
      try {
        referenced = await attempt.session.hasRetainedAssetReference(prepared.audio.assetId);
      } catch {
        /* Unknown authority retains the ready journal and bytes. */
      }
      if (!referenced) {
        await prepared.audio.cancel();
        attempt.prepared = attempt.prepared.filter((entry) => entry !== prepared);
        const original = attempt.originals.find(
          (entry) => entry.preview.clipId === prepared.entry.preview.clipId
        );
        if (original?.preview.publication === prepared.audio) delete original.preview.publication;
      }
    }
  });
  attempt.compensationPending = false;
}

async function execute(attempt: Attempt, signal: AbortSignal) {
  if (attempt.compensationPending) await compensate(attempt);
  if (!attempt.accepted) {
    try {
      await prepareAndCommit(attempt, signal);
    } catch (error) {
      let accepted = false;
      try {
        accepted = await recover(attempt);
      } catch (recovery) {
        throw new AggregateError(
          [error, recovery],
          error instanceof Error ? error.message : 'Text take acknowledgement needs recovery.',
          { cause: recovery }
        );
      }
      if (!accepted) {
        try {
          await compensate(attempt);
        } catch (cleanup) {
          throw new AggregateError([error, cleanup], 'Text take cleanup needs recovery.', {
            cause: cleanup,
          });
        }
        throw error;
      }
    }
  }
  await withAttachments(attempt.prepared, async () => {
    // Accepted metadata owns bytes even when Cancel arrives during its acknowledgement.
    for (const { audio } of attempt.prepared) {
      if (attempt.published.has(audio)) continue;
      await audio.publish();
      attempt.published.add(audio);
    }
  });
}
