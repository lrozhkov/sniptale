import { createReviewTextEgressAuthority } from '../../features/ai/egress-authority';
import {
  reviewTextContextSchema,
  type ReviewTextContext,
  type ReviewTextProposal,
  type ReviewTextStart,
} from '../../contracts/ai/review-text';
import { createReviewTextDocument } from '../../features/video/review/text-document';
import {
  applyReviewTextRewrite,
  matchesReviewTextRewriteBasis,
  type ReviewTextRewriteBasis,
} from '../../features/video/review/text-rewrite';
import { projectReviewTextFragment } from '../../features/video/review/text-projection';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import type { ReviewOperation } from '../../features/video/review/types';
import { reviewTextTakeGeometry } from './text-take';
import type { createVideoReviewSession } from './session';
import { requestLlmSessionToken } from '../ai-session/llm-session';
import { runReviewTextJob } from './text-rewrite-client';

type Session = ReturnType<typeof createVideoReviewSession>;
export interface ReviewTextRewritePreview extends ReviewTextRewriteBasis {
  geometry: string;
  workspaceId: string;
  proposal?: ReviewTextProposal;
  receipt?: Extract<ReviewOperation, { target: 'advancedContent' }>;
  receiptMode?: 'replace' | 'variant';
  generatedIds?: string[];
}
export type ReviewTextRewriteOptions = Pick<
  ReviewTextContext,
  'prompt' | 'mode' | 'wholeDocument' | 'changeIntervals' | 'resegment'
> & {
  window?: { start: number; end: number };
};
type ReviewTextRewriteModel = Pick<
  ReviewTextStart,
  'modelId' | 'approvedProviderId' | 'approvedDestination' | 'approvedModelCode'
>;

/** Captures the exact disclosure before pending buffers are drained or Save begins. */
export function captureReviewTextRewrite(
  session: Session,
  ids: readonly string[],
  options: ReviewTextRewriteOptions
): ReviewTextRewritePreview {
  const current = session.getSnapshot();
  const document = current.document.advancedContent.text ?? createReviewTextDocument();
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error('invalid-request');
  const fragments = ids.map((id) => {
    const fragment = document.fragments.find((entry) => entry.id === id);
    if (!fragment) throw new Error('stale');
    return structuredClone(fragment);
  });
  if (
    options.wholeDocument &&
    (ids.length !== document.fragments.length ||
      document.fragments.some((entry) => !ids.includes(entry.id)))
  )
    throw new Error('stale');
  const segments = buildReviewTimeMap(
    current.snapshot.workspace.source.duration,
    current.document.edits
  );
  const disclosed = fragments.map((fragment) => {
    const projected = projectReviewTextFragment(fragment, segments);
    if (projected.excludedFromResult || projected.partiallyExcluded) throw new Error('stale');
    return {
      id: fragment.id,
      text: fragment.text,
      start: projected.ranges[0]!.start,
      end: projected.ranges.at(-1)!.end,
      ...(fragment.language ? { language: fragment.language } : {}),
    };
  });
  const window = options.window ?? {
    start: Math.min(...disclosed.map((entry) => entry.start)),
    end: Math.max(...disclosed.map((entry) => entry.end)),
  };
  if (window.end > (segments.at(-1)?.resultEnd ?? 0)) throw new Error('invalid-request');
  const parsed = reviewTextContextSchema.safeParse({
    ...options,
    version: 1,
    window,
    fragments: disclosed,
  });
  if (!parsed.success) {
    const budget = parsed.error.issues.some(
      (issue) => issue.code === 'too_big' || issue.message === 'Choose a smaller text scope'
    );
    throw new Error(budget ? 'too-large' : 'invalid');
  }
  return {
    context: parsed.data,
    fragments,
    geometry: reviewTextTakeGeometry(session),
    workspaceId: current.snapshot.workspace.aggregateId,
  };
}

function assertBasis(session: Session, preview: ReviewTextRewritePreview) {
  if (
    session.getSnapshot().snapshot.workspace.aggregateId !== preview.workspaceId ||
    reviewTextTakeGeometry(session) !== preview.geometry ||
    !matchesReviewTextRewriteBasis(
      session.getSnapshot().document.advancedContent.text ?? createReviewTextDocument(),
      preview
    )
  )
    throw new Error('stale');
}

/** One whole-buffer Save, one frozen context and one paid operation, including autosave OFF. */
export async function generateReviewTextRewrite(
  session: Session,
  preview: ReviewTextRewritePreview,
  model: ReviewTextRewriteModel,
  signal: AbortSignal
): Promise<ReviewTextRewritePreview> {
  signal.throwIfAborted();
  assertBasis(session, preview);
  const saved = await session.saveBuffered();
  signal.throwIfAborted();
  assertBasis(session, preview);
  const input = {
    ...structuredClone(model),
    context: structuredClone(preview.context),
    scope: { workspaceId: preview.workspaceId, workspaceRevision: saved.workspace.revision },
  };
  const egressAuthority = await createReviewTextEgressAuthority(input);
  signal.throwIfAborted();
  const llmSessionToken = await requestLlmSessionToken('review-text', egressAuthority);
  signal.throwIfAborted();
  assertBasis(session, preview);
  if (
    session.getSnapshot().dirty ||
    session.getSnapshot().snapshot.workspace.revision !== saved.workspace.revision
  )
    throw new Error('stale');
  const proposal = await runReviewTextJob(
    { ...input, type: 'start', requestId: crypto.randomUUID(), llmSessionToken },
    signal
  );
  signal.throwIfAborted();
  assertBasis(session, preview);
  return { ...preview, proposal };
}

/** Receipt acknowledgement precedes Save and never discards newer local buffers or repeats the request. */
export async function reviewTextRewriteWasApplied(
  session: Session,
  preview: ReviewTextRewritePreview,
  signal: AbortSignal
): Promise<boolean> {
  signal.throwIfAborted();
  if (session.getSnapshot().snapshot.workspace.aggregateId !== preview.workspaceId)
    throw new Error('stale');
  if (!preview.receipt) return false;
  const accepted = await session.readRetainedReviewOperation(preview.receipt.id);
  signal.throwIfAborted();
  if (!accepted) return false;
  if (
    accepted.target !== 'advancedContent' ||
    JSON.stringify(accepted.after.text) !== JSON.stringify(preview.receipt.after.text)
  )
    throw new Error('stale');
  return true;
}

export async function applyReviewTextRewritePreview(
  session: Session,
  preview: ReviewTextRewritePreview,
  signal: AbortSignal,
  mode: 'replace' | 'variant'
): Promise<void> {
  if (await reviewTextRewriteWasApplied(session, preview, signal)) return;
  assertBasis(session, preview);
  if (!preview.proposal || (preview.receiptMode && preview.receiptMode !== mode))
    throw new Error('invalid-request');
  const before = structuredClone(session.getSnapshot().document.advancedContent);
  const generatedIds = preview.generatedIds ?? [];
  let index = 0;
  const next = applyReviewTextRewrite(
    before.text ?? createReviewTextDocument(),
    preview,
    preview.proposal,
    mode,
    () => {
      const id = generatedIds[index] ?? crypto.randomUUID();
      generatedIds[index++] = id;
      return id;
    }
  );
  if (!next.ok) throw new Error(next.reason);
  if (!next.changed) {
    await session.saveBuffered();
    signal.throwIfAborted();
    assertBasis(session, preview);
    return;
  }
  preview.generatedIds = generatedIds;
  preview.receiptMode = mode;
  preview.receipt = {
    id: preview.receipt?.id ?? crypto.randomUUID(),
    at: preview.receipt?.at ?? Date.now(),
    target: 'advancedContent',
    before,
    after: { ...before, text: next.document },
  };
  signal.throwIfAborted();
  await session.commitDurable(preview.receipt);
}
