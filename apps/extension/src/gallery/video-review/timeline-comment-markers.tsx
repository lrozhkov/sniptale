import { MessageSquare } from 'lucide-react';
import { translate } from '../../platform/i18n';
import type { ReviewAnnotation, ReviewEdit } from '../../features/video/review/types';
import { ReviewTimelineLabel } from './timeline-label';
import { reviewTimeLabel } from './controls';

const percent = (time: number, duration: number) => `${(time / duration) * 100}%`;

type CommentMarkerProps = {
  group: readonly ReviewAnnotation[];
  duration: number;
  cuts: readonly ReviewEdit[];
  onComment(annotation: ReviewAnnotation): void;
};

/** Co-located point comments share one marker; each authored record stays selectable. */
export function ReviewCommentMarkers(props: {
  annotations: readonly ReviewAnnotation[];
  duration: number;
  edits?: readonly ReviewEdit[];
  onComment(annotation: ReviewAnnotation): void;
}) {
  const groups = new Map<string, ReviewAnnotation[]>();
  for (const annotation of props.annotations) {
    const anchor = annotation.anchor;
    const key =
      anchor.kind === 'point' ? `point:${anchor.time}` : `range:${anchor.start}:${anchor.end}`;
    const group = groups.get(key) ?? [];
    group.push(annotation);
    groups.set(key, group);
  }
  const cuts = props.edits?.filter((edit) => edit.kind === 'cut') ?? [];
  return [...groups.values()].map((group) => (
    <ReviewCommentMarker
      key={group[0]!.id}
      group={group}
      duration={props.duration}
      cuts={cuts}
      onComment={props.onComment}
    />
  ));
}

function ReviewCommentMarker(props: CommentMarkerProps) {
  const annotation = props.group[0]!;
  const anchor = annotation.anchor;
  const time = anchor.kind === 'point' ? anchor.time : anchor.start;
  const covered = props.cuts.filter((cut) =>
    anchor.kind === 'point'
      ? time >= cut.start && time < cut.end
      : cut.start < anchor.end && cut.end > anchor.start
  );
  const cutHint = covered.length ? translate('gallery.videoReview.cutOverlapHint') : '';
  const caption = props.group.map((item) => item.text).join(' · ');
  const range = anchor.kind === 'range';
  return (
    <button
      type="button"
      title={`${caption}${cutHint ? ` · ${cutHint}` : ''}`}
      data-cut-suppressed={covered.length ? 'true' : 'false'}
      aria-label={[
        translate('gallery.videoReview.commentText'),
        reviewTimeLabel(time),
        caption,
        ...(cutHint ? [cutHint] : []),
      ].join(' · ')}
      onClick={() => props.onComment(annotation)}
      style={{
        left: range
          ? percent(time, props.duration)
          : `clamp(8px, ${percent(time, props.duration)}, calc(100% - 8px))`,
        ...(range
          ? {
              width: percent(anchor.end - anchor.start, props.duration),
              top: -18,
              height: 16,
              backgroundColor:
                'color-mix(in srgb, var(--sniptale-color-accent) 14%, var(--sniptale-color-surface-canvas))',
            }
          : { top: -18 }),
      }}
      className={`absolute z-10 flex h-4 min-w-4 items-center justify-center gap-1
        overflow-hidden rounded border border-[var(--sniptale-color-border-accent-strong)]
        bg-[var(--sniptale-color-surface-canvas)] px-1 text-[10px] font-medium
        text-[var(--sniptale-color-accent-emphasis)] ${range ? '' : '-translate-x-1/2'}
        ${covered.length && !range ? 'opacity-50' : ''}`}
    >
      {anchor.kind === 'range'
        ? covered.map((cut) => (
            <span
              key={cut.id}
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 border-x border-dashed
            border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]/65"
              style={{
                left: percent(
                  Math.max(cut.start, anchor.start) - anchor.start,
                  anchor.end - anchor.start
                ),
                width: percent(
                  Math.min(cut.end, anchor.end) - Math.max(cut.start, anchor.start),
                  anchor.end - anchor.start
                ),
              }}
            />
          ))
        : null}
      {range ? (
        <ReviewTimelineLabel
          icon={<MessageSquare size={11} />}
          name={translate('gallery.videoReview.commentText')}
          value={props.group.length > 1 ? String(props.group.length) : undefined}
        />
      ) : (
        <>
          <MessageSquare size={11} className="shrink-0" />
          {props.group.length > 1 ? <span>{props.group.length}</span> : null}
        </>
      )}
    </button>
  );
}
