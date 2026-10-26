import { useCallback, useEffect, useRef, useState } from 'react';
import { Scissors } from 'lucide-react';
import { translate } from '../../platform/i18n';
import { reviewTimelineItemTone, reviewTimelineResizeHandleClassName } from './controls';
import { deferReviewGesture, type ReviewBeforeAction } from './note-transitions';
import { useReviewGestureCancellation } from './timeline-drag';
import { reviewTrackMetrics } from './track-row';
import type { useReviewWebcamEditor } from './webcam-editor';

type Range = { start: number; end: number };
type Edge = 'start' | 'end';
type Drag = {
  node: HTMLButtonElement;
  pointerId: number;
  x: number;
  width: number;
  edge: Edge;
  range: Range;
  next: Range;
  admission: ReturnType<typeof deferReviewGesture>;
};

/** Hide boundaries use source time and one admitted edit; the main video keeps its clock. */
export function ReviewWebcamHiddenMarker(props: {
  editor: ReturnType<typeof useReviewWebcamEditor>;
  id: string;
  duration: number;
  admit: ReviewBeforeAction;
  compact: boolean;
}) {
  const { editor, id, duration, admit } = props;
  const range = editor.camera!.hiddenRanges.find((item) => item.id === id)!;
  const drag = useRef<Drag | null>(null);
  const pending = useRef<ReturnType<typeof deferReviewGesture> | null>(null);
  const [preview, setPreview] = useState<Range | null>(null);
  const cancel = useCallback(() => {
    const current = drag.current;
    drag.current = null;
    pending.current?.cancel();
    pending.current = null;
    if (current?.node.hasPointerCapture(current.pointerId))
      current.node.releasePointerCapture(current.pointerId);
    setPreview(null);
  }, []);
  useReviewGestureCancellation(cancel);
  const enabled = editor.canResizeHidden(id, range);
  useEffect(() => {
    if (!enabled) cancel();
  }, [enabled, cancel]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !pending.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel();
    };
    window.addEventListener('keydown', escape, true);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', escape, true);
      const current = drag.current;
      drag.current = null;
      pending.current?.cancel();
      pending.current = null;
      if (current?.node.hasPointerCapture(current.pointerId))
        current.node.releasePointerCapture(current.pointerId);
    };
  }, [cancel]);
  const bounded = (original: Range, edge: Edge, time: number): Range => {
    const others = editor.camera!.hiddenRanges.filter((item) => item.id !== id);
    const left = Math.max(
      0,
      ...others.filter((item) => item.end <= original.start).map((item) => item.end)
    );
    const right = Math.min(
      duration,
      ...others.filter((item) => item.start >= original.end).map((item) => item.start)
    );
    // Keep the parser's minimum span despite binary subtraction at a fractional endpoint.
    const minimum = 0.001 + Number.EPSILON * Math.max(1, duration);
    return edge === 'start'
      ? { start: Math.max(left, Math.min(original.end - minimum, time)), end: original.end }
      : { start: original.start, end: Math.max(original.start + minimum, Math.min(right, time)) };
  };
  const dragPosition = (current: Drag, clientX: number) =>
    bounded(
      current.range,
      current.edge,
      current.range[current.edge] + ((clientX - current.x) / Math.max(1, current.width)) * duration
    );
  const metrics = reviewTrackMetrics(props.compact);
  const visible = preview ?? range;
  const selected = editor.selection.kind === 'webcam-hidden' && editor.selection.id === id;
  return (
    <div
      data-ui="gallery.videoReview.webcamHiddenMarker"
      data-review-removal-key={`webcam-hidden:${id}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      className={
        'absolute z-20 flex items-center justify-center overflow-hidden border rounded ' +
        reviewTimelineItemTone(selected, 'cut')
      }
      style={{
        top: metrics.inset,
        height: metrics.body,
        left: `${(visible.start / duration) * 100}%`,
        width: `${((visible.end - visible.start) / duration) * 100}%`,
      }}
    >
      <button
        type="button"
        title={translate('gallery.videoReview.webcamHidden')}
        aria-label={`${translate('gallery.videoReview.webcamHidden')} ${range.start}–${range.end}`}
        className="absolute inset-0 flex items-center justify-center"
        onClick={(event) => {
          event.stopPropagation();
          admit(() => editor.select({ kind: 'webcam-hidden', id }));
        }}
      >
        <Scissors size={12} aria-hidden />
      </button>
      {(['start', 'end'] as const).map((edge) => (
        <button
          type="button"
          key={edge}
          data-webcam-hidden-id={id}
          data-edge={edge}
          disabled={!enabled}
          aria-label={translate(
            edge === 'start' ? 'gallery.videoReview.resizeStart' : 'gallery.videoReview.resizeEnd'
          )}
          className={`${reviewTimelineResizeHandleClassName} ${edge === 'start' ? 'left-0' : 'right-0'}`}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => {
            event.stopPropagation();
            if (event.button !== 0 || !enabled) return;
            cancel();
            event.preventDefault();
            event.currentTarget.focus({ preventScroll: true });
            drag.current = {
              node: event.currentTarget,
              pointerId: event.pointerId,
              x: event.clientX,
              width:
                event.currentTarget.parentElement!.parentElement!.getBoundingClientRect().width,
              edge,
              range,
              next: range,
              admission: deferReviewGesture(admit, () =>
                editor.select({ kind: 'webcam-hidden', id })
              ),
            };
            pending.current = drag.current.admission;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            event.stopPropagation();
            const current = drag.current;
            if (!current || current.pointerId !== event.pointerId) return;
            current.next = dragPosition(current, event.clientX);
            setPreview(current.next);
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
            const current = drag.current;
            if (!current || current.pointerId !== event.pointerId) return;
            current.next = dragPosition(current, event.clientX);
            drag.current = null;
            if (current.node.hasPointerCapture(current.pointerId))
              current.node.releasePointerCapture(current.pointerId);
            setPreview(null);
            if (
              current.next.start !== current.range.start ||
              current.next.end !== current.range.end
            )
              current.admission.commit(() => {
                if (pending.current === current.admission) pending.current = null;
                editor.resizeHidden(id, current.next);
              });
            else {
              current.admission.cancel();
              pending.current = null;
            }
          }}
          onPointerCancel={cancel}
          onLostPointerCapture={() => {
            if (drag.current) cancel();
          }}
          onKeyDown={(event) => {
            if (!enabled || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
            event.preventDefault();
            event.stopPropagation();
            const next = bounded(
              range,
              edge,
              range[edge] + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 1 : 1 / 30)
            );
            if (next.start !== range.start || next.end !== range.end) {
              cancel();
              const admission = deferReviewGesture(admit, () => {});
              pending.current = admission;
              admission.commit(() => {
                if (pending.current === admission) pending.current = null;
                editor.resizeHidden(id, next);
              });
            }
          }}
        >
          <span className="h-4 w-px bg-current opacity-60" />
        </button>
      ))}
    </div>
  );
}
