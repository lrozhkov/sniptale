import {
  parseReviewTextProposal,
  reviewTextContextSchema,
  type ReviewTextContext,
  type ReviewTextProposal,
} from '../../../contracts/ai/review-text';
import {
  editReviewTextFragment,
  reviewTextOrigins,
  type ReviewTextDocument,
  type ReviewTextFragment,
  type ReviewTextOrigin,
} from './text-document';
import { parseReviewTextDocument } from './text-validation';

export interface ReviewTextRewriteBasis {
  context: ReviewTextContext;
  fragments: ReviewTextFragment[];
}

/** Appearance may change independently; content and placement must still match the disclosure. */
export function matchesReviewTextRewriteBasis(
  document: ReviewTextDocument,
  basis: ReviewTextRewriteBasis
): boolean {
  if (
    !reviewTextContextSchema.safeParse(basis.context).success ||
    basis.context.fragments.length !== basis.fragments.length ||
    new Set(basis.fragments.map((entry) => entry.id)).size !== basis.fragments.length
  )
    return false;
  if (
    basis.context.wholeDocument &&
    (document.fragments.length !== basis.fragments.length ||
      document.fragments.some(
        (entry) => !basis.fragments.some((captured) => captured.id === entry.id)
      ))
  )
    return false;
  return basis.fragments.every((captured, index) => {
    const disclosed = basis.context.fragments[index];
    const current = document.fragments.find((entry) => entry.id === captured.id);
    return (
      disclosed?.id === captured.id &&
      disclosed.text === captured.text &&
      disclosed.language === captured.language &&
      !!current &&
      current.text === captured.text &&
      current.language === captured.language &&
      current.revision === captured.revision &&
      current.timingRevision === captured.timingRevision &&
      current.start === captured.start &&
      current.end === captured.end &&
      current.timeDomain === captured.timeDomain &&
      current.variantId === captured.variantId &&
      JSON.stringify(reviewTextOrigins(current)) === JSON.stringify(reviewTextOrigins(captured))
    );
  });
}

function collectOrigins(fragments: ReviewTextFragment[]): ReviewTextOrigin[] {
  const seen = new Set<string>();
  return fragments.flatMap(reviewTextOrigins).filter((origin) => {
    const key = JSON.stringify(origin);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Fixed placement edits retain identity and only convert clocks with explicit permission. */
function replaceFixedFragments(
  document: ReviewTextDocument,
  proposal: ReviewTextProposal,
  changeIntervals: boolean
): ReturnType<typeof applyReviewTextRewrite> {
  let next = document;
  let changed = false;
  for (const fragment of proposal.fragments) {
    const id = fragment.fromIds[0]!;
    const current = next.fragments.find((entry) => entry.id === id)!;
    const timingChanged =
      changeIntervals &&
      (current.timeDomain !== 'result' ||
        current.start !== fragment.start ||
        current.end !== fragment.end);
    changed ||= current.text !== fragment.text || timingChanged;
    const edit = editReviewTextFragment(next, id, {
      text: fragment.text,
      ...(timingChanged ? { start: fragment.start!, end: fragment.end! } : {}),
    });
    if (!edit.ok) return { ok: false, reason: 'invalid' };
    next = edit.document;
    if (timingChanged && current.timeDomain !== 'result') {
      next = {
        ...next,
        fragments: next.fragments.map((entry) => {
          if (entry.id !== id) return entry;
          const { words: _words, ...fields } = entry;
          return {
            ...fields,
            timeDomain: 'result',
            alignment: 'manual',
            timingRevision: current.timingRevision + 1,
          };
        }),
      };
    }
  }
  const parsed = parseReviewTextDocument(next);
  return parsed
    ? { ok: true, document: changed ? parsed : document, changed }
    : { ok: false, reason: 'invalid' };
}

/** One pure text operation. The caller owns persistence; no sound, snapshot or mute is rewritten. */
export function applyReviewTextRewrite(
  document: ReviewTextDocument,
  basis: ReviewTextRewriteBasis,
  value: ReviewTextProposal,
  mode: 'replace' | 'variant',
  createId: () => string
):
  | { ok: true; document: ReviewTextDocument; changed: boolean }
  | { ok: false; reason: 'stale' | 'invalid' } {
  if (!matchesReviewTextRewriteBasis(document, basis)) return { ok: false, reason: 'stale' };
  const proposal = parseReviewTextProposal(value, basis.context);
  if (!proposal) return { ok: false, reason: 'invalid' };
  if (
    mode === 'replace' &&
    basis.context.resegment &&
    proposal.fragments.length === basis.fragments.length &&
    proposal.fragments.every((fragment) => {
      const current = document.fragments.find((entry) => entry.id === fragment.fromIds[0]);
      return (
        fragment.fromIds.length === 1 &&
        current?.timeDomain === 'result' &&
        current.text === fragment.text &&
        current.start === fragment.start &&
        current.end === fragment.end
      );
    })
  )
    return { ok: true, document, changed: false };
  if (!basis.context.resegment && mode === 'replace')
    return replaceFixedFragments(document, proposal, basis.context.changeIntervals);
  const variantId = mode === 'variant' ? createId() : undefined;
  const generated: ReviewTextFragment[] = proposal.fragments.map((fragment) => {
    const sources = fragment.fromIds.map((id) =>
      document.fragments.find((entry) => entry.id === id)!
    );
    const first = sources[0]!;
    const { words: _words, origin: _origin, origins: _origins, ...base } = first;
    const origins = collectOrigins(sources);
    return {
      ...base,
      id: createId(),
      text: fragment.text,
      originalText: sources.map((entry) => entry.text).join('\n'),
      revision: 0,
      timingRevision: 0,
      alignment: 'manual',
      derivedFrom: [...fragment.fromIds],
      ...(basis.context.changeIntervals
        ? { start: fragment.start!, end: fragment.end!, timeDomain: 'result' as const }
        : {}),
      ...(origins.length === 1 ? { origin: origins[0]! } : origins.length ? { origins } : {}),
      ...(variantId ? { variantId, showInVideo: false } : {}),
    };
  });
  const selected = new Set(basis.fragments.map((entry) => entry.id));
  const fragments =
    mode === 'variant'
      ? [...document.fragments, ...generated]
      : [...document.fragments.filter((entry) => !selected.has(entry.id)), ...generated];
  const parsed = parseReviewTextDocument({ ...document, fragments });
  return parsed ? { ok: true, document: parsed, changed: true } : { ok: false, reason: 'invalid' };
}
