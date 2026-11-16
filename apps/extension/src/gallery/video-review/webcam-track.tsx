import { reviewTimelineHint } from './timeline-hints';
import { ReviewTrackVisibilityButton } from './track-row';
import { reviewTrackMetrics, ReviewTrackCuts, ReviewTrackRow } from './track-row';
import { ReviewWebcamHiddenMarker } from './webcam-hidden-marker';
import { ReviewWebcamPositionMarker } from './webcam-position-marker';
import { Camera, Eye, EyeOff } from 'lucide-react';
import { translate } from '../../platform/i18n';
import { reviewCompactTrackButtonClassName } from './controls';
import { type ReviewBeforeAction } from './note-transitions';
import type { ReviewTrackProjection } from './track-projection';
import type { useReviewWebcamEditor } from './webcam-editor';

type Range = { start: number; end: number };
/** Camera uses source-axis intervals; hiding it never cuts or changes the main transport. */
export function ReviewWebcamTrack(props: {
  compact?: boolean;
  editor: ReturnType<typeof useReviewWebcamEditor>;
  projection: ReviewTrackProjection;
  beforeAction?: ReviewBeforeAction | undefined;
}) {
  const { projection } = props;
  const original = props.editor;
  const display = projection.display;
  const sourceRange = (range: Range) => ({
    start: display.displayToResult(range.start),
    end: display.displayToResult(range.end),
  });
  const editor: typeof original = {
    ...original,
    camera: original.camera
      ? {
          ...original.camera,
          hiddenRanges: original.camera.hiddenRanges.map((range) => ({
            ...range,
            start: display.resultToDisplay(range.start),
            end: display.resultToDisplay(range.end, 'end'),
          })),
          positions: original.camera.positions.map((position) => ({
            ...position,
            time: display.resultToDisplay(position.time),
          })),
        }
      : original.camera,
    hide: (range) => original.hide(sourceRange(range)),
    resizeHidden: (id, range) => original.resizeHidden(id, sourceRange(range)),
    canResizeHidden: (id, range) => original.canResizeHidden(id, sourceRange(range)),
    movePosition: (id, time) => original.movePosition(id, display.displayToResult(time)),
  };
  const camera = editor.camera;
  const compact = props.compact ?? false;
  const metrics = reviewTrackMetrics(compact);
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
  return (
    <ReviewTrackRow
      track="webcam"
      muted={!camera.enabled}
      label={translate('gallery.videoReview.webcam')}
      icon={<Camera size={14} aria-hidden />}
      controls={
        <>
          <ReviewTrackVisibilityButton
            track="webcam"
            label={translate('gallery.videoReview.webcamApply')}
            className={reviewCompactTrackButtonClassName}
            aria-pressed={camera.enabled}
            onClick={() => admit(() => void editor.toggle())}
          >
            {camera.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
          </ReviewTrackVisibilityButton>
        </>
      }
    >
      <div
        data-ui="gallery.videoReview.webcamTrack"
        data-review-hint={reviewTimelineHint(
          translate('gallery.videoReview.webcam'),
          0,
          projection.display.duration,
          camera.enabled ? undefined : translate('gallery.videoReview.itemDisabled')
        )}
        data-review-snap-domain="display"
        className="relative rounded bg-[var(--sniptale-color-surface-hover)]"
        style={{ height: metrics.step, touchAction: 'none' }}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (
            event.button === 0 &&
            !(event.target instanceof Element && event.target.closest('button'))
          )
            admit(() => editor.select({ kind: 'webcam' }));
        }}
      >
        <ReviewTrackCuts projection={projection} />
        <ReviewWebcamTrackMarkers
          editor={editor}
          duration={projection.display.duration}
          admit={admit}
          compact={compact}
        />
      </div>
    </ReviewTrackRow>
  );
}

/** Authored hide ranges and position anchors share the track's source axis and admission. */
function ReviewWebcamTrackMarkers({
  editor,
  duration,
  admit,
  compact = false,
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
        <ReviewWebcamHiddenMarker
          key={range.id}
          editor={editor}
          id={range.id}
          duration={duration}
          admit={admit}
          compact={compact}
        />
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
