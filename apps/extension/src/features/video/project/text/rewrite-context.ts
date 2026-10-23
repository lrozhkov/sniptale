import {
  reviewTextContextSchema,
  type ReviewTextContext,
} from '../../../../contracts/ai/review-text';
import type { VideoProject } from '../types/model';
import { projectVideoProjectTextFragment } from './projection';

/** Captures one document's exact result-time placements without changing authored text. */
export function captureVideoProjectTextRewriteContext(
  project: VideoProject,
  documentId: string,
  ids: readonly string[],
  options: Pick<
    ReviewTextContext,
    'prompt' | 'mode' | 'wholeDocument' | 'changeIntervals' | 'resegment'
  > & { window?: { start: number; end: number } }
): ReviewTextContext {
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error('invalid-request');
  const entry = project.textDocuments?.find((document) => document.id === documentId);
  if (!entry) throw new Error('stale');
  const fragments = ids.map((id) => {
    const fragment = entry.document.fragments.find((candidate) => candidate.id === id);
    if (!fragment) throw new Error('stale');
    return fragment;
  });
  if (
    options.wholeDocument &&
    (ids.length !== entry.document.fragments.length ||
      entry.document.fragments.some((fragment) => !ids.includes(fragment.id)))
  )
    throw new Error('stale');
  const disclosed = fragments.map((fragment) => {
    const projected = projectVideoProjectTextFragment(project, entry, fragment);
    if (projected.excludedFromResult || projected.partiallyExcluded) throw new Error('stale');
    const ranges = projected.ranges.toSorted(
      (left, right) => left.start - right.start || left.end - right.end
    );
    return {
      id: fragment.id,
      text: fragment.text,
      start: Math.min(...ranges.map((range) => range.start)),
      end: Math.max(...ranges.map((range) => range.end)),
      ...(ranges.length > 1 ? { ranges } : {}),
      ...(fragment.language ? { language: fragment.language } : {}),
    };
  });
  const window = options.window ?? {
    start: Math.min(...disclosed.map((fragment) => fragment.start)),
    end: Math.max(...disclosed.map((fragment) => fragment.end)),
  };
  if (window.end > project.duration) throw new Error('invalid-request');
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
    throw new Error(budget ? 'too-large' : 'invalid-request');
  }
  return parsed.data;
}
