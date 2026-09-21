import { useEffect, useRef, useState } from 'react';
import { NumericRow } from '../../ui/compact-inspector-controls';
import { nearestReviewBoundary } from '../../features/video/review/cuts';
import { reviewEditEdgeLimits } from '../../features/video/review/edit-range';
import type { ReviewAnchor, ReviewEdit } from '../../features/video/review/types';
import { translate } from '../../platform/i18n';

/** Preview stays local during a gesture; each completed change applies one reversible edit. */
export function ReviewEditRangeFields(props: {
  edit: ReviewEdit;
  edits: readonly ReviewEdit[];
  duration: number;
  boundaries?: readonly number[] | undefined;
  onApply(range: ReviewAnchor): Promise<boolean>;
}) {
  const [draft, setDraft] = useState(props.edit);
  const [applying, setApplying] = useState(false);
  const pending = useRef(false);
  const applied = useRef(props.edit);
  useEffect(() => {
    applied.current = props.edit;
    setDraft(props.edit);
  }, [props.edit]);
  const commit = async (next: ReviewEdit) => {
    if (
      pending.current ||
      (next.start === applied.current.start && next.end === applied.current.end)
    )
      return;
    pending.current = true;
    setApplying(true);
    setDraft(next);
    try {
      if (await props.onApply({ kind: 'range', start: next.start, end: next.end }))
        applied.current = next;
      else setDraft(applied.current);
    } finally {
      pending.current = false;
      setApplying(false);
    }
  };
  return (
    <div data-ui="gallery.videoReview.editRangeFields" className="min-w-0 space-y-3">
      {(['start', 'end'] as const).map((edge) => {
        const limits = reviewEditEdgeLimits({ ...props, edit: draft, edge });
        const values = limits.values;
        const normalize = (value: number) =>
          values?.length
            ? nearestReviewBoundary(value, values)
            : Math.max(limits.min, Math.min(limits.max, value));
        const change = (value: number) =>
          setDraft((current) => ({ ...current, [edge]: normalize(value) }));
        return (
          <NumericRow
            key={edge}
            appearance="plain"
            className="min-h-8! w-full grid-cols-[minmax(0,1fr)_auto]! py-0!"
            label={translate(
              edge === 'start' ? 'gallery.videoReview.rangeStart' : 'gallery.videoReview.rangeEnd'
            )}
            value={draft[edge]}
            unit="s"
            min={limits.min}
            max={limits.max}
            step={0.01}
            precision={2}
            disabled={applying || limits.min >= limits.max}
            normalizeValue={normalize}
            getStepValue={
              values
                ? (value, direction) =>
                    direction === 1
                      ? (values.find((boundary) => boundary > value + 0.000001) ?? limits.max)
                      : (values.findLast((boundary) => boundary < value - 0.000001) ?? limits.min)
                : undefined
            }
            scrub={
              values?.length
                ? {
                    min: 0,
                    max: values.length - 1,
                    step: 1,
                    value: values.indexOf(normalize(draft[edge])),
                    toValue: (index) => values[Math.round(index)] ?? draft[edge],
                  }
                : { min: limits.min, max: limits.max, step: 0.01 }
            }
            onPreviewValue={change}
            onCommitValue={(value) => void commit({ ...draft, [edge]: normalize(value) })}
          />
        );
      })}
    </div>
  );
}
