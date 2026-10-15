import { useEffect, useRef, useState } from 'react';
import { Diamond } from 'lucide-react';
import { translate, formatNumber } from '../../platform/i18n';
import { moveQuickEditWebcamPosition } from '../../features/video/review/advanced/webcam';
import { deferReviewGesture, type ReviewBeforeAction } from './note-transitions';
import { useReviewDragEscape } from './timeline-drag';
import type { useReviewWebcamEditor } from './webcam-editor';

type Drag = {
  node: HTMLButtonElement;
  pointerId: number;
  x: number;
  time: number;
  width: number;
  moved: boolean;
  admission: ReturnType<typeof deferReviewGesture>;
};

/** One captured gesture previews locally and writes one bounded source-time anchor on release. */
export function ReviewWebcamPositionMarker(props: {
  editor: ReturnType<typeof useReviewWebcamEditor>;
  index: number;
  duration: number;
  admit: ReviewBeforeAction;
}) {
  const { editor, index, duration, admit } = props;
  const position = editor.camera!.positions[index]!;
  const drag = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const cancel = () => {
    const current = drag.current;
    drag.current = null;
    current?.admission.cancel();
    if (current?.node.hasPointerCapture(current.pointerId))
      current.node.releasePointerCapture(current.pointerId);
    setPreview(null);
  };
  useReviewDragEscape(drag, () => setPreview(null));
  useEffect(() => {
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('blur', cancel);
      drag.current?.admission.cancel();
    };
  }, []);
  const bounded = (time: number) =>
    moveQuickEditWebcamPosition(editor.camera!, position.id, time, duration).positions[index]!.time;
  const selected =
    editor.selection.kind === 'webcam-position' && editor.selection.id === position.id;
  const timeLabel = formatNumber(preview ?? position.time, { maximumFractionDigits: 3 });
  const label = `${translate('gallery.videoReview.webcamPosition')} ${index + 1} · ${timeLabel} s`;
  return (
    <button
      type="button"
      data-ui="gallery.videoReview.webcamPosition"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      className={
        'absolute inset-y-0 z-20 flex w-7 -translate-x-1/2 items-center justify-center rounded-sm ' +
        'outline-none focus-visible:ring-1 focus-visible:ring-[var(--sniptale-color-accent)] ' +
        'hover:bg-[var(--sniptale-color-surface-hover)] ' +
        (selected
          ? 'text-[var(--sniptale-color-accent)]'
          : 'text-[var(--sniptale-color-text-secondary)]')
      }
      style={{
        left: `${((preview ?? position.time) / duration) * 100}%`,
        cursor: preview === null ? 'grab' : 'grabbing',
        touchAction: 'none',
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        drag.current = {
          node: event.currentTarget,
          pointerId: event.pointerId,
          x: event.clientX,
          time: position.time,
          width: event.currentTarget.parentElement!.getBoundingClientRect().width,
          moved: false,
          admission: deferReviewGesture(admit, () =>
            editor.select({ kind: 'webcam-position', id: position.id })
          ),
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        event.stopPropagation();
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        if (Math.abs(event.clientX - current.x) >= 3) current.moved = true;
        if (current.moved)
          setPreview(
            bounded(
              current.time + ((event.clientX - current.x) / Math.max(1, current.width)) * duration
            )
          );
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        drag.current = null;
        if (current.node.hasPointerCapture(current.pointerId))
          current.node.releasePointerCapture(current.pointerId);
        setPreview(null);
        current.admission.commit(() =>
          current.moved
            ? editor.movePosition(
                position.id,
                bounded(
                  current.time +
                    ((event.clientX - current.x) / Math.max(1, current.width)) * duration
                )
              )
            : editor.navigate(position.id)
        );
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onClick={(event) => {
        if (event.detail === 0) admit(() => editor.navigate(position.id));
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        event.stopPropagation();
        const step = event.shiftKey ? 1 : 0.1;
        admit(() =>
          editor.movePosition(
            position.id,
            bounded(position.time + (event.key === 'ArrowLeft' ? -step : step))
          )
        );
      }}
    >
      <Diamond
        size={18}
        strokeWidth={1.5}
        className="fill-[var(--sniptale-color-surface-panel)]"
        aria-hidden
      />
    </button>
  );
}
