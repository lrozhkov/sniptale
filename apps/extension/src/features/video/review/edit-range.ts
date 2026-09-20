import { createReviewCut, createReviewSpeed } from './cuts';
import type { ReviewEdit } from './types';

/** Bounds for one source edge exclude neighbours, empty edits and removing the entire video. */
export function reviewEditEdgeLimits(args: {
  edit: ReviewEdit;
  edge: 'start' | 'end';
  duration: number;
  edits: readonly ReviewEdit[];
  boundaries?: readonly number[] | undefined;
}) {
  const { edit, edge, duration } = args;
  const others = args.edits.filter((item) => item.id !== edit.id);
  const minimum = Math.min(0.01, edit.end - edit.start);
  const before = Math.max(
    0,
    ...others.filter((item) => item.end <= edit.start).map((item) => item.end)
  );
  const after = Math.min(
    duration,
    ...others.filter((item) => item.start >= edit.end).map((item) => item.start)
  );
  const maxLength =
    edit.kind === 'cut'
      ? duration -
        others.reduce((sum, item) => sum + (item.kind === 'cut' ? item.end - item.start : 0), 0) -
        0.01
      : duration;
  const min = edge === 'start' ? Math.max(before, edit.end - maxLength) : edit.start + minimum;
  const max = edge === 'start' ? edit.end - minimum : Math.min(after, edit.start + maxLength);
  const values = args.boundaries?.filter((value) => {
    const input = {
      id: edit.id,
      selection: { kind: 'range' as const, start: edit.start, end: edit.end, [edge]: value },
      duration,
      edits: others,
      boundaries: args.boundaries ?? [],
    };
    return !!(edit.kind === 'cut'
      ? createReviewCut(input)
      : createReviewSpeed({ ...input, rate: edit.rate, audio: edit.audio }));
  });
  return {
    min: values?.[0] ?? min,
    max: values?.at(-1) ?? max,
    values,
  };
}
