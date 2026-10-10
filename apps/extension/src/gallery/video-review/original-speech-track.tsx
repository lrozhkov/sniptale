import { Captions, List, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ReviewTextFragment } from '../../features/video/review/text-document';
import { packReviewTextRows } from '../../features/video/review/text-projection';
import type { useReviewText } from './use-review-text';
import { deferReviewGesture, type ReviewBeforeAction } from './note-transitions';
import { useReviewDragEscape } from './timeline-drag';
import { translate } from '../../platform/i18n';
import {
  ReviewButton,
  reviewTimeLabel,
  reviewTimelineItemTone,
  reviewTimelineResizeHandleClassName,
  reviewTextButtonClassName,
} from './controls';
import { ReviewTrackRow, ReviewTrackCuts } from './track-row';

/** Independent text shares track rows, source-axis gestures and the existing inspector. */
type TextTrackProps = {
  editor: ReturnType<typeof useReviewText>;
  selectedId?: string | undefined;
  busy: boolean;
  beforeAction?: ReviewBeforeAction | undefined;
  onSelect(id: string): void;
  onOpenDocument(): void;
};

export function ReviewTextTrack(props: TextTrackProps) {
  const gesture = useReviewTextTrackGesture(props);
  const preview = gesture.preview;
  const fragments = props.editor.document.fragments.map((fragment) =>
    preview?.id === fragment.id ? preview : fragment
  );
  const ranges = fragments.map((fragment) => ({
    id: fragment.id,
    ...props.editor.sourceInterval(fragment),
  }));
  const rows = packReviewTextRows(ranges);
  const rowCount = Math.max(1, ...Array.from(rows.values(), (row) => row + 1));
  const duration = Math.max(0.01, props.editor.projection.duration);
  return (
    <ReviewTrackRow
      label={translate('gallery.videoReview.textTrack')}
      icon={<Captions size={14} aria-hidden />}
      controls={
        <>
          <ReviewButton
            label={translate('gallery.videoReview.textTrackOpen')}
            className={`${reviewTextButtonClassName} !w-7 !min-h-7 !h-7 !px-0`}
            disabled={props.busy}
            onClick={props.onOpenDocument}
          >
            <List size={14} />
          </ReviewButton>
          <ReviewButton
            label={translate('gallery.videoReview.textFragmentAdd')}
            className={`${reviewTextButtonClassName} !w-7 !min-h-7 !h-7 !px-0`}
            disabled={props.busy || props.editor.projection.resultDuration <= 0}
            onClick={() => props.editor.add()}
          >
            <Plus size={14} />
          </ReviewButton>
        </>
      }
    >
      <div
        data-ui="gallery.videoReview.textTrack"
        className="relative my-1"
        style={{ height: rowCount * 32 }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {fragments.map((fragment) => {
          const range = props.editor.sourceInterval(fragment);
          return (
            <div
              key={fragment.id}
              role="button"
              tabIndex={props.busy ? -1 : 0}
              aria-label={[
                fragment.text || translate('gallery.videoReview.speechText'),
                `${reviewTimeLabel(range.start)}–${reviewTimeLabel(range.end)}`,
              ].join(' · ')}
              aria-pressed={props.selectedId === fragment.id}
              aria-disabled={props.busy}
              data-text-id={fragment.id}
              data-dragging={gesture.draggingId === fragment.id ? 'true' : undefined}
              className={[
                'absolute min-w-px touch-none select-none overflow-hidden rounded border px-2 text-left text-[11px]',
                reviewTimelineItemTone(props.selectedId === fragment.id),
              ].join(' ')}
              style={{
                top: (rows.get(fragment.id) ?? 0) * 32,
                height: 28,
                left: `${(range.start / duration) * 100}%`,
                width: `${(Math.max(0, range.end - range.start) / duration) * 100}%`,
              }}
              onKeyDown={(event) => {
                if (props.busy || (event.key !== 'Enter' && event.key !== ' ')) return;
                event.preventDefault();
                (props.beforeAction ?? ((action) => action()))(() => props.onSelect(fragment.id));
              }}
              onPointerDown={(event) => gesture.start(event, fragment)}
              onPointerMove={gesture.move}
              onPointerUp={gesture.finish}
              onPointerCancel={gesture.cancel}
            >
              <span className="block truncate leading-7">
                {fragment.text || translate('gallery.videoReview.speechText')}
              </span>
              {(['start', 'end'] as const).map((edge) => (
                <span
                  key={edge}
                  data-text-edge={edge}
                  className={`${reviewTimelineResizeHandleClassName} ${edge === 'start' ? 'left-0' : 'right-0'}`}
                >
                  <span className="h-4 w-px bg-current opacity-60" />
                </span>
              ))}
            </div>
          );
        })}
        <ReviewTrackCuts projection={props.editor.projection} />
      </div>
    </ReviewTrackRow>
  );
}

/** One pointer capture owns the disposable preview, admission, Escape and final timing commit. */
function useReviewTextTrackGesture(props: TextTrackProps) {
  const drag = useRef<{
    base: ReviewTextFragment;
    x: number;
    sourceAt: number;
    width: number;
    edge: 'start' | 'end' | 'move';
    node: HTMLElement;
    pointerId: number;
    admission: ReturnType<typeof deferReviewGesture>;
  } | null>(null);
  const [preview, setPreview] = useState<ReviewTextFragment | null>(null);
  const previewRef = useRef<ReviewTextFragment | null>(null);
  const clearPreview = () => {
    previewRef.current = null;
    setPreview(null);
  };
  useReviewDragEscape(drag, clearPreview);
  const duration = Math.max(0.01, props.editor.projection.duration);
  const cancel = () => {
    const current = drag.current;
    drag.current = null;
    current?.admission.cancel();
    if (current?.node.hasPointerCapture(current.pointerId))
      current.node.releasePointerCapture(current.pointerId);
    clearPreview();
  };
  const start = (event: React.PointerEvent<HTMLDivElement>, fragment: ReviewTextFragment) => {
    if (props.busy || event.button !== 0) return;
    event.stopPropagation();
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return;
    const edge =
      event.target instanceof Element
        ? event.target.closest('[data-text-edge]')?.getAttribute('data-text-edge')
        : null;
    drag.current = {
      base: fragment,
      x: event.clientX,
      sourceAt: ((event.clientX - bounds.left) / bounds.width) * duration,
      width: bounds.width,
      edge: edge === 'start' || edge === 'end' ? edge : 'move',
      node: event.currentTarget,
      pointerId: event.pointerId,
      admission: deferReviewGesture(props.beforeAction, () => props.onSelect(fragment.id)),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    const base = current.base;
    const limit = base.timeDomain === 'source' ? duration : props.editor.projection.resultDuration;
    const delta =
      base.timeDomain === 'source'
        ? ((event.clientX - current.x) / current.width) * duration
        : props.editor.projection.delta(current.sourceAt, event.clientX - current.x, current.width);
    const shift = Math.max(-base.start, Math.min(limit - base.end, delta));
    const start =
      current.edge === 'move'
        ? base.start + shift
        : current.edge === 'start'
          ? Math.max(0, Math.min(base.end - 0.01, base.start + delta))
          : base.start;
    const end =
      current.edge === 'move'
        ? base.end + shift
        : current.edge === 'end'
          ? Math.min(limit, Math.max(base.start + 0.01, base.end + delta))
          : base.end;
    const next = { ...base, start, end };
    previewRef.current = next;
    setPreview(next);
  };
  const finish = () => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    const next = previewRef.current;
    clearPreview();
    if (current.node.hasPointerCapture(current.pointerId))
      current.node.releasePointerCapture(current.pointerId);
    if (next && (next.start !== current.base.start || next.end !== current.base.end))
      current.admission.commit(() =>
        props.editor.change(
          current.base.id,
          { start: next.start, end: next.end },
          current.base.timingRevision
        )
      );
  };
  return { preview, draggingId: drag.current?.base.id, start, move, finish, cancel };
}
