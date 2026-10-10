import type {
  ReviewTextFragment,
  ReviewVoiceTextSnapshot,
} from '../../features/video/review/text-document';
import { projectReviewTextFragment } from '../../features/video/review/text-projection';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { anchorReviewVoiceover } from '../../features/video/review/voiceover-edits';
import { withVoiceoverAttachmentLock } from '../../composition/persistence/projects/voiceover-publication-lock';
import { importReviewAudio, importedAudioClip, type PreparedReviewAudio } from './audio-import';
import type { createVideoReviewSession } from './session';

type Session = ReturnType<typeof createVideoReviewSession>;

export interface ReviewTextTakeOptions {
  muteSource?: boolean;
  sourceAudioAvailable?: (() => boolean) | undefined;
}

export interface ReviewTextTakePreview {
  clipId: string;
  textSnapshot: ReviewVoiceTextSnapshot;
  geometry: string;
  duration: number;
  resultStart: number;
  blob: Blob;
  url: string;
  expiresAt: number;
  publication?: PreparedReviewAudio;
}

/** Source identity and edits determine the placement clock, independently of profile or capture. */
export function reviewTextTakeGeometry(session: Session): string {
  const state = session.getSnapshot();
  return JSON.stringify([
    state.snapshot.workspace.aggregateId,
    state.snapshot.workspace.sourceAssetId,
    state.snapshot.workspace.source,
    state.document.edits,
  ]);
}

export function readReviewTextTakeFragment(session: Session, id: string): ReviewTextFragment {
  const fragment = session
    .getSnapshot()
    .document.advancedContent.text?.fragments.find((entry) => entry.id === id);
  if (!fragment) throw new Error('stale');
  return fragment;
}

/** Read-only capture; callers own the explicit Save or human recording gesture. */
export function captureReviewTextTakeBasis(session: Session, id: string) {
  const fragment = structuredClone(readReviewTextTakeFragment(session, id));
  if (!fragment.text.trim()) throw new Error('invalid-request');
  const state = session.getSnapshot();
  const map = buildReviewTimeMap(state.snapshot.workspace.source.duration, state.document.edits);
  const projection = projectReviewTextFragment(fragment, map);
  const resultDuration = map.at(-1)?.resultEnd ?? 0;
  const clockLimit =
    fragment.timeDomain === 'source' ? state.snapshot.workspace.source.duration : resultDuration;
  if (projection.excludedFromResult || fragment.end > clockLimit) throw new Error('duration');
  return {
    fragment,
    geometry: reviewTextTakeGeometry(session),
    resultStart: projection.ranges[0]!.start,
    resultDuration,
  };
}

/** Every kind retains the same immutable text/placement basis; only AI retains a profile. */
export function assertReviewTextTakeBasis(
  session: Session,
  preview: Pick<ReviewTextTakePreview, 'expiresAt' | 'geometry' | 'textSnapshot'>
) {
  const snapshot = preview.textSnapshot;
  const fragment = readReviewTextTakeFragment(session, snapshot.textId);
  if (
    Date.now() >= preview.expiresAt ||
    preview.geometry !== reviewTextTakeGeometry(session) ||
    fragment.revision !== snapshot.revision ||
    fragment.timingRevision !== snapshot.timingRevision ||
    fragment.start !== snapshot.start ||
    fragment.end !== snapshot.end ||
    fragment.timeDomain !== snapshot.timeDomain ||
    fragment.text !== snapshot.text
  )
    throw new Error('stale');
}

/** Ordinary clip publication shared by AI, microphone and Gallery, with independent byte/clip admission. */
export async function applyReviewTextTake(args: {
  session: Session;
  preview: ReviewTextTakePreview;
  signal: AbortSignal;
  filename: string;
  preparation?: NonNullable<Parameters<typeof importReviewAudio>[0]['preparation']>;
  onRetained?: (() => void) | undefined;
  options?: ReviewTextTakeOptions | undefined;
}) {
  const { session, preview, signal } = args;
  signal.throwIfAborted();
  const previous = preview.publication;
  if (previous) {
    const accepted = await withVoiceoverAttachmentLock(previous.assetId, async () => {
      if (await session.hasRetainedVoiceoverClip(preview.clipId, previous.assetId)) {
        args.onRetained?.();
        await previous.publish();
        return true;
      }
      if (!(await session.hasRetainedAssetReference(previous.assetId))) {
        await previous.cancel();
        delete preview.publication;
      }
      return false;
    });
    if (accepted) return;
  }
  await session.flush();
  assertReviewTextTakeBasis(session, preview);
  if (args.options?.muteSource && !args.options.sourceAudioAvailable?.())
    throw new Error('invalid-request');
  const workspaceId = session.getSnapshot().snapshot.workspace.aggregateId;
  const preparation =
    args.preparation ??
    (preview.publication
      ? {
          assetId: preview.publication.assetId,
          prepare: async () => preview.publication!,
        }
      : undefined);
  await importReviewAudio({
    file: new File([preview.blob], args.filename, { type: preview.blob.type }),
    signal,
    ...(preparation ? { preparation } : {}),
    requiredReview: { aggregateId: workspaceId, clipId: preview.clipId },
    assertCurrentTarget: () => assertReviewTextTakeBasis(session, preview),
    onPrepared: (prepared) => {
      preview.publication = prepared;
    },
    hasDurableReference: (assetId) => session.hasRetainedAssetReference(assetId),
    attach: (assetId, duration) => commitReviewTextTake(args, assetId, duration),
  });
}

/** This is the only authored-take history writer; playback and text neighbors remain unchanged. */
async function commitReviewTextTake(
  args: Parameters<typeof applyReviewTextTake>[0],
  assetId: string,
  duration: number
) {
  const { session, preview, signal } = args;
  signal.throwIfAborted();
  assertReviewTextTakeBasis(session, preview);
  const state = session.getSnapshot();
  const before = state.document.advancedContent;
  if (
    args.options?.muteSource &&
    (!args.options.sourceAudioAvailable?.() || (before.audio.original.mutes?.length ?? 0) >= 512)
  )
    throw new Error('invalid-request');
  const map = buildReviewTimeMap(state.snapshot.workspace.source.duration, state.document.edits);
  const end = map.at(-1)?.resultEnd ?? 0;
  if (Math.abs(duration - preview.duration) > 0.001 || preview.resultStart + duration > end)
    throw new Error('duration');
  if (before.audio.voiceover.some((clip) => clip.id === preview.clipId)) throw new Error('stale');
  const clip = anchorReviewVoiceover(
    {
      ...importedAudioClip(assetId, duration, preview.resultStart, end),
      id: preview.clipId,
      textSnapshot: structuredClone(preview.textSnapshot),
    },
    map
  );
  try {
    await session.commitDurable({
      id: crypto.randomUUID(),
      at: Date.now(),
      target: 'advancedContent',
      before,
      after: {
        ...before,
        audio: {
          ...before.audio,
          ...(args.options?.muteSource
            ? {
                original: {
                  ...before.audio.original,
                  mutes: [
                    ...(before.audio.original.mutes ?? []),
                    { id: crypto.randomUUID(), kind: 'take' as const, clipId: preview.clipId },
                  ],
                },
              }
            : {}),
          voiceoverSegments: [...map],
          voiceover: [
            ...before.audio.voiceover.map((item) => anchorReviewVoiceover(item, map)),
            clip,
          ],
        },
      },
    });
  } catch (error) {
    if (await session.hasRetainedVoiceoverClip(preview.clipId, assetId).catch(() => false))
      args.onRetained?.();
    throw error;
  }
  args.onRetained?.();
}

/** Disposes audition data; current/history/recovery and ambiguous authority preserve publication claims. */
export async function cleanupReviewTextTakePreview(
  session: Session,
  preview: ReviewTextTakePreview
) {
  URL.revokeObjectURL(preview.url);
  const prepared = preview.publication;
  if (prepared)
    await withVoiceoverAttachmentLock(prepared.assetId, async () => {
      if (!(await session.hasRetainedAssetReference(prepared.assetId))) await prepared.cancel();
    });
}
