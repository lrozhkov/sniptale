import {
  reviewTrackMetrics,
  reviewTrackGestureLocked,
  ReviewTrackCuts,
  ReviewTrackRow,
} from './track-row';
import { ReviewWebcamPositionMarker } from './webcam-position-marker';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Camera, Eye, EyeOff, Settings2 } from 'lucide-react';
import { translate } from '../../platform/i18n';
import {
  ReviewButton,
  reviewCompactTrackButtonClassName,
  reviewTimelineItemTone,
} from './controls';
import { deferReviewGesture, type ReviewBeforeAction } from './note-transitions';
import { useReviewDragEscape } from './timeline-drag';
import type { ReviewTrackProjection } from './track-projection';
import type { useReviewWebcamEditor } from './webcam-editor';

type Range = { start: number; end: number };
type Drag = {
  node: HTMLDivElement;
  pointerId: number;
  start: number;
  range: Range;
  admission: ReturnType<typeof deferReviewGesture>;
};

/** Camera uses source-axis intervals; hiding it never cuts or changes the main transport. */
export function ReviewWebcamTrack(props: {
  compact?: boolean;
  editor: ReturnType<typeof useReviewWebcamEditor>;
  projection: ReviewTrackProjection;
  beforeAction?: ReviewBeforeAction | undefined;
}) {
  const { editor, projection } = props;
  const camera = editor.camera;
  const compact = props.compact ?? false;
  const [preview, setPreview] = useState<Range | null>(null);
  const drag = useRef<Drag | null>(null);
  const clear = () => setPreview(null);
  const cancel = () => {
    const current = drag.current;
    drag.current = null;
    current?.admission.cancel();
    if (current?.node.hasPointerCapture(current.pointerId))
      current.node.releasePointerCapture(current.pointerId);
    clear();
  };
  useReviewDragEscape(drag, clear);
  useEffect(() => {
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('blur', cancel);
      drag.current?.admission.cancel();
    };
  }, []);
  if (!camera)
    return (
      <ReviewTrackRow
        placeholder
        track="webcam"
        label={translate('gallery.videoReview.webcam')}
        icon={<Camera size={14} aria-hidden />}
      >
        <div className="h-8" />
      </ReviewTrackRow>
    );
  const admit = props.beforeAction ?? ((action: () => void) => action());
  const timeAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return (
      Math.round(
        Math.max(
          0,
          Math.min(
            projection.duration,
            ((event.clientX - rect.left) / Math.max(1, rect.width)) * projection.duration
          )
        ) * 1000
      ) / 1000
    );
  };
  return (
    <ReviewTrackRow
      track="webcam"
      muted={!camera.enabled}
      label={translate('gallery.videoReview.webcam')}
      icon={<Camera size={14} aria-hidden />}
      controls={
        <>
          <ReviewButton
            label={translate('gallery.videoReview.webcamSettings')}
            className={reviewCompactTrackButtonClassName}
            onClick={() => admit(() => editor.select({ kind: 'webcam' }))}
          >
            <Settings2 size={14} aria-hidden />
          </ReviewButton>
          <ReviewButton
            label={translate('gallery.videoReview.webcamApply')}
            className={reviewCompactTrackButtonClassName}
            aria-pressed={camera.enabled}
            onClick={() => admit(() => void editor.toggle())}
          >
            {camera.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
          </ReviewButton>
        </>
      }
    >
      <div
        data-ui="gallery.videoReview.webcamTrack"
        className="relative border-b border-[var(--sniptale-color-border-soft)]"
        style={{ height: reviewTrackMetrics(compact).step, touchAction: 'none' }}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (
            event.button !== 0 ||
            (event.target instanceof Element && event.target.closest('button'))
          )
            return;
          if (reviewTrackGestureLocked(event.currentTarget)) {
            editor.select({ kind: 'webcam' });
            return;
          }
          const start = timeAt(event);
          const admission = deferReviewGesture(props.beforeAction, () =>
            editor.select({ kind: 'webcam' })
          );
          drag.current = {
            node: event.currentTarget,
            pointerId: event.pointerId,
            start,
            range: { start, end: start },
            admission,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          event.stopPropagation();
          const current = drag.current;
          if (!current) return;
          const time = timeAt(event);
          current.range = {
            start: Math.min(current.start, time),
            end: Math.max(current.start, time),
          };
          setPreview(current.range);
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          const current = drag.current;
          if (!current) return;
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          clear();
          if (current.range.end - current.range.start >= 0.05)
            current.admission.commit(() => editor.hide(current.range));
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
      >
        <ReviewTrackCuts projection={projection} />
        <ReviewWebcamTrackMarkers editor={editor} duration={projection.duration} admit={admit} />
        {preview ? (
          <div
            className="pointer-events-none absolute inset-y-0 z-30 border border-[var(--sniptale-color-accent)]"
            style={{
              left: `${(preview.start / projection.duration) * 100}%`,
              width: `${((preview.end - preview.start) / projection.duration) * 100}%`,
              opacity: editor.canHide(preview) ? 1 : 0.4,
            }}
          />
        ) : null}
      </div>
    </ReviewTrackRow>
  );
}

/** Authored hide ranges and position anchors share the track's source axis and admission. */
function ReviewWebcamTrackMarkers({
  editor,
  duration,
  admit,
}: {
  compact?: boolean;
  editor: ReturnType<typeof useReviewWebcamEditor>;
  duration: number;
  admit: ReviewBeforeAction;
}) {
  const camera = editor.camera!;
  return (
    <>
      {camera.hiddenRanges.map((range) => (
        <button
          type="button"
          key={range.id}
          title={translate('gallery.videoReview.webcamHidden')}
          aria-label={`${translate('gallery.videoReview.webcamHidden')} ${range.start}–${range.end}`}
          className={
            'absolute inset-y-0.5 z-20 flex items-center justify-center overflow-hidden ' +
            'border border-dashed rounded-sm ' +
            reviewTimelineItemTone(
              editor.selection.kind === 'webcam-hidden' && editor.selection.id === range.id
            )
          }
          style={{
            left: `${(range.start / duration) * 100}%`,
            width: `${((range.end - range.start) / duration) * 100}%`,
          }}
          onClick={() => admit(() => editor.select({ kind: 'webcam-hidden', id: range.id }))}
        >
          <EyeOff size={12} aria-hidden />
        </button>
      ))}
      {camera.positions.map((position, index) => (
        <ReviewWebcamPositionMarker
          key={position.id}
          editor={editor}
          index={index}
          duration={duration}
          admit={admit}
        />
      ))}
    </>
  );
}
