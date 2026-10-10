import type { ReviewSpeechTarget } from '../../contracts/ai/audio';
import {
  createReviewTextDocument,
  reviewTextOrigins,
  type ReviewTextDocument,
} from '../../features/video/review/text-document';
import { parseReviewTextDocument } from '../../features/video/review/text-validation';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { projectReviewVoiceover } from '../../features/video/review/voiceover-edits';
import {
  extractReviewSpeechWav,
  planReviewSpeechChunks,
  reviewSpeechWavIsSilent,
} from './speech-audio';
import { runReviewSpeechJob } from './speech-client';
import {
  getReviewSpeechClip,
  getReviewSpeechTarget,
  reviewSpeechGeometry,
  reviewSpeechScope,
  type ReviewSpeechSession,
} from './speech-publication';
import { reviewSpeechPhrases } from './speech-transcription';
import type { ReviewOperation } from '../../features/video/review/types';

import {
  recognitionFragments,
  reviewRecognitionPhrases,
  type RecognitionChunk,
  type ReviewRecognitionGrouping,
} from './recognition-text';
export type { ReviewRecognitionGrouping } from './recognition-text';

/** Disposable completed chunks permit explicit retries, never hidden paid requests or durable text writes. */
export interface ReviewRecognitionJob {
  id: string;
  identity: string;
  workspaceId: string;
  workspaceRevision: number;
  geometry: string;
  documentBasis: string;
  target: ReviewSpeechTarget;
  modelId: string;
  approvedProviderId: string;
  grouping: ReviewRecognitionGrouping;
  source: string | Blob;
  ranges: Array<{ start: number; end: number }>;
  chunks: RecognitionChunk[];
  relatedIds: string[];
}

/** Proposed text is editable independently of the captured accepted-document basis. */
export interface ReviewRecognitionProposal {
  job: ReviewRecognitionJob;
  document: ReviewTextDocument;
  receipt?: Extract<ReviewOperation, { target: 'advancedContent' }>;
}

function textBasis(session: ReviewSpeechSession) {
  return JSON.stringify(
    session.getSnapshot().document.advancedContent.text ?? createReviewTextDocument()
  );
}

/** Recognition depends on sample identity and placement; playback gain never changes the captured speech. */
function recognitionGeometry(session: ReviewSpeechSession, target: ReviewSpeechTarget) {
  if (target.kind === 'original') return reviewSpeechGeometry(session, target);
  const clip = getReviewSpeechClip(session, target.clipId);
  return JSON.stringify([
    target,
    {
      id: clip.id,
      assetId: clip.assetId,
      timelineStart: clip.timelineStart,
      sourceOffset: clip.sourceOffset,
      duration: clip.duration,
      tempo: clip.tempo ?? 1,
      sourceAnchor: clip.sourceAnchor ?? null,
      dormant: clip.dormant ?? false,
    },
    session.getSnapshot().document.edits,
  ]);
}

function assertRecognitionBasis(session: ReviewSpeechSession, job: ReviewRecognitionJob) {
  if (
    session.getSnapshot().snapshot.workspace.aggregateId !== job.workspaceId ||
    recognitionGeometry(session, job.target) !== job.geometry ||
    textBasis(session) !== job.documentBasis
  )
    throw new Error('stale');
}

function recognitionRanges(
  session: ReviewSpeechSession,
  target: ReviewSpeechTarget,
  selection?: { start: number; end: number }
) {
  const state = session.getSnapshot();
  const duration = state.snapshot.workspace.source.duration;
  if (
    selection &&
    (target.kind !== 'original' ||
      !Number.isFinite(selection.start) ||
      !Number.isFinite(selection.end) ||
      selection.start < 0 ||
      selection.end <= selection.start ||
      selection.end > duration)
  )
    throw new Error('invalid-request');
  const map = buildReviewTimeMap(duration, state.document.edits);
  if (target.kind === 'voiceover' && getReviewSpeechClip(session, target.clipId).dormant) return [];
  const ranges =
    target.kind === 'original'
      ? [{ start: selection?.start ?? 0, end: selection?.end ?? duration }]
      : projectReviewVoiceover([getReviewSpeechClip(session, target.clipId)], map).map((slice) => ({
          start: slice.sourceOffset,
          end: slice.sourceOffset + slice.duration * (slice.playbackRate ?? 1),
        }));
  if (target.kind !== 'original') return ranges;
  const continuous: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    const previous = continuous.at(-1);
    if (previous && Math.abs(previous.end - range.start) < 1e-7) previous.end = range.end;
    else continuous.push(range);
  }
  return continuous;
}

/** Freezes source/text, saves the whole intended buffer once, then prepares original native intervals independently of Cuts. */
export async function prepareReviewRecognition(
  session: ReviewSpeechSession,
  target: ReviewSpeechTarget,
  modelId: string,
  approvedProviderId: string,
  signal: AbortSignal,
  options: {
    original?: { file: Blob; sourceAssetId: string };
    selection?: { start: number; end: number };
    grouping?: ReviewRecognitionGrouping;
    previous?: ReviewRecognitionJob;
  } = {}
): Promise<ReviewRecognitionJob> {
  signal.throwIfAborted();
  if (!modelId.trim() || !approvedProviderId.trim()) throw new Error('invalid-request');
  const source = getReviewSpeechTarget(session, target);
  if (
    target.kind === 'original' &&
    (!options.original || options.original.sourceAssetId !== source.assetId)
  )
    throw new Error('stale');
  const ranges = recognitionRanges(session, target, options.selection);
  if (!ranges.length) throw new Error('invalid-request');
  const geometry = recognitionGeometry(session, target);
  const documentBasis = textBasis(session);
  const grouping = options.grouping ?? 'sentences-pauses';
  const identity = JSON.stringify([
    session.getSnapshot().snapshot.workspace.aggregateId,
    geometry,
    documentBasis,
    modelId,
    approvedProviderId,
    grouping,
    options.selection,
  ]);
  const saved = await session.saveBuffered();
  signal.throwIfAborted();
  const previous = options.previous?.identity === identity ? options.previous : undefined;
  const job: ReviewRecognitionJob = {
    id: previous?.id ?? crypto.randomUUID(),
    identity,
    workspaceId: saved.workspace.aggregateId,
    workspaceRevision: saved.workspace.revision,
    geometry,
    documentBasis,
    target: structuredClone(target),
    modelId,
    approvedProviderId,
    grouping,
    source:
      previous?.source ?? (target.kind === 'original' ? options.original!.file : source.assetId),
    ranges,
    chunks: previous?.chunks ?? [],
    relatedIds: [],
  };
  assertRecognitionBasis(session, job);
  job.relatedIds = (session.getSnapshot().document.advancedContent.text?.fragments ?? [])
    .filter(
      (fragment) =>
        reviewTextOrigins(fragment).length > 0 &&
        reviewTextOrigins(fragment).every(
          (origin) =>
            origin.kind === target.kind &&
            (target.kind === 'original' || origin.clipId === target.clipId) &&
            ranges.some((range) => origin.start >= range.start && origin.end <= range.end)
        )
    )
    .map((fragment) => fragment.id);
  if (!previous)
    for (const [range, interval] of ranges.entries()) {
      const chunks = await planReviewSpeechChunks(job.source, [interval], signal);
      job.chunks.push(...chunks.map((chunk) => ({ ...chunk, range })));
    }
  signal.throwIfAborted();
  assertRecognitionBasis(session, job);
  return job;
}

/** Completed chunks remain disposable for explicit retry; nothing is written until Apply. */
export async function runReviewRecognition(
  session: ReviewSpeechSession,
  job: ReviewRecognitionJob,
  signal: AbortSignal,
  onProgress?: (completed: number, total: number) => void
): Promise<ReviewRecognitionProposal> {
  for (const chunk of job.chunks) {
    signal.throwIfAborted();
    assertRecognitionBasis(session, job);
    const state = session.getSnapshot();
    if (state.dirty || state.snapshot.workspace.revision !== job.workspaceRevision)
      throw new Error('stale');
    if (!chunk.result) {
      const result = await runReviewSpeechJob(
        {
          type: 'start',
          operation: 'transcription',
          requestId: crypto.randomUUID(),
          modelId: job.modelId,
          approvedProviderId: job.approvedProviderId,
          scope: reviewSpeechScope(session, job.target, chunk.start, chunk.end),
        },
        {
          signal,
          prepareInput: async (active) => {
            const wav = await extractReviewSpeechWav(job.source, chunk.start, chunk.end, active);
            return (await reviewSpeechWavIsSilent(wav, active)) ? null : wav;
          },
        }
      );
      signal.throwIfAborted();
      assertRecognitionBasis(session, job);
      if (result.type !== 'transcript') throw new Error('invalid-response');
      reviewSpeechPhrases(result.result, chunk.start, chunk.end);
      chunk.result = structuredClone(result.result);
    }
    onProgress?.(
      job.chunks.filter((entry) => entry.result !== undefined).length,
      job.chunks.length
    );
  }
  signal.throwIfAborted();
  assertRecognitionBasis(session, job);
  const document = parseReviewTextDocument({
    version: 1,
    fragments: recognitionFragments(
      job,
      reviewRecognitionPhrases(job.chunks, job.grouping),
      job.target.kind === 'voiceover'
        ? projectReviewVoiceover(
            [getReviewSpeechClip(session, job.target.clipId)],
            buildReviewTimeMap(
              session.getSnapshot().snapshot.workspace.source.duration,
              session.getSnapshot().document.edits
            )
          )
        : []
    ),
  });
  if (!document) throw new Error('too-large');
  return { job, document };
}

/** Reads the exact accepted receipt without saving, replaying or discarding the editor's buffer. */
export async function reviewRecognitionWasApplied(
  session: ReviewSpeechSession,
  proposal: ReviewRecognitionProposal,
  signal: AbortSignal
): Promise<boolean> {
  signal.throwIfAborted();
  if (session.getSnapshot().snapshot.workspace.aggregateId !== proposal.job.workspaceId)
    throw new Error('stale');
  if (!proposal.receipt) return false;
  const accepted = await session.readRetainedReviewOperation(proposal.receipt.id);
  signal.throwIfAborted();
  if (!accepted) return false;
  if (
    accepted.target !== 'advancedContent' ||
    JSON.stringify(accepted.after.text) !== JSON.stringify(proposal.receipt.after.text)
  )
    throw new Error('stale');
  return true;
}

/** One explicit durable history operation; retrying its acknowledgement never repeats recognition. */
export async function applyReviewRecognition(
  session: ReviewSpeechSession,
  proposal: ReviewRecognitionProposal,
  signal: AbortSignal,
  mode: 'add' | 'replace' = 'add'
): Promise<void> {
  signal.throwIfAborted();
  const job = proposal.job;
  if (session.getSnapshot().snapshot.workspace.aggregateId !== job.workspaceId)
    throw new Error('stale');
  if (await reviewRecognitionWasApplied(session, proposal, signal)) return;
  assertRecognitionBasis(session, job);
  const before = structuredClone(session.getSnapshot().document.advancedContent);
  // Canonical authority confirmed absence above. Keep this operation's accepted text intent,
  // and refresh only unrelated content so a buffered gain edit cannot trap a failed Apply.
  if (proposal.receipt) {
    const text = proposal.receipt.after.text;
    if (!text) throw new Error('stale');
    proposal.receipt = {
      ...proposal.receipt,
      before,
      after: { ...before, text },
    };
  } else {
    const related = new Set(mode === 'replace' ? job.relatedIds : []);
    const text = parseReviewTextDocument({
      version: 1,
      fragments: [
        ...(before.text?.fragments ?? []).filter((fragment) => !related.has(fragment.id)),
        ...proposal.document.fragments,
      ],
    });
    if (!text) throw new Error('too-large');
    proposal.receipt = {
      id: crypto.randomUUID(),
      at: Date.now(),
      target: 'advancedContent',
      before,
      after: { ...before, text },
    };
  }
  await session.commitDurable(proposal.receipt);
}
