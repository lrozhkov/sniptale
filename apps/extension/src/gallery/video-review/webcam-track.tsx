import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { reviewTimelineHint } from './timeline-hints';
import { ReviewTrackVisibilityButton } from './track-row';
import { reviewTrackMetrics, ReviewTrackCuts, ReviewTrackRow } from './track-row';
import { ReviewWebcamHiddenMarker } from './webcam-hidden-marker';
import { ReviewWebcamPositionMarker } from './webcam-position-marker';
import { Camera, Eye, EyeOff } from 'lucide-react';
import { translate, useAppLocale } from '../../platform/i18n';
import { reviewCompactTrackButtonClassName } from './controls';
import { type ReviewBeforeAction } from './note-transitions';
import type { ReviewTrackProjection } from './track-projection';
import type { useReviewWebcamEditor } from './webcam-editor';

type WebcamEditor = ReturnType<typeof useReviewWebcamEditor>;
type WebcamTrackCommands = Pick<
  WebcamEditor,
  'toggle' | 'select' | 'resizeHidden' | 'movePosition' | 'navigate'
> & {
  admit: ReviewBeforeAction;
};
const admitImmediately: ReviewBeforeAction = (action) => action();

/** Camera uses source-axis intervals; hiding it never cuts or changes the main transport. */
export function ReviewWebcamTrack(props: {
  compact?: boolean;
  editor: WebcamEditor;
  projection: ReviewTrackProjection;
  beforeAction?: ReviewBeforeAction | undefined;
}) {
  const locale = useAppLocale();
  const { camera, toggle, select, resizeHidden, movePosition, navigate } = props.editor;
  const display = props.projection.display;
  const admit = props.beforeAction ?? admitImmediately;
  const current = useRef({ toggle, select, resizeHidden, movePosition, navigate, admit, display });
  useLayoutEffect(() => {
    current.current = { toggle, select, resizeHidden, movePosition, navigate, admit, display };
  }, [toggle, select, resizeHidden, movePosition, navigate, admit, display]);
  const commands = useMemo<WebcamTrackCommands>(
    () => ({
      toggle: () => current.current.toggle(),
      select: (selection, context) => current.current.select(selection, context),
      resizeHidden: (id, range) =>
        current.current.resizeHidden(id, {
          start: current.current.display.displayToResult(range.start),
          end: current.current.display.displayToResult(range.end),
        }),
      movePosition: (id, time) =>
        current.current.movePosition(id, current.current.display.displayToResult(time)),
      navigate: (id) => current.current.navigate(id),
      admit: (action) => current.current.admit(action),
    }),
    []
  );
  const projectedCamera = useMemo(
    () =>
      camera
        ? {
            ...camera,
            hiddenRanges: camera.hiddenRanges.map((range) => ({
              ...range,
              start: display.resultToDisplay(range.start),
              end: display.resultToDisplay(range.end, 'end'),
            })),
            positions: camera.positions.map((position) => ({
              ...position,
              time: display.resultToDisplay(position.time),
            })),
          }
        : camera,
    [camera, display]
  );
  const hiddenEnabled =
    camera?.hiddenRanges
      .map((range) => (props.editor.canResizeHidden(range.id, range) ? '1' : '0'))
      .join('') ?? '';
  const selection = props.editor.selection;
  return (
    <WebcamTrackBody
      camera={projectedCamera}
      commands={commands}
      projection={props.projection}
      compact={props.compact ?? false}
      hiddenEnabled={hiddenEnabled}
      locale={locale}
      selectedHiddenId={selection.kind === 'webcam-hidden' ? selection.id : undefined}
      selectedPositionId={selection.kind === 'webcam-position' ? selection.id : undefined}
    />
  );
}

const WebcamTrackBody = memo(function WebcamTrackBody(props: {
  camera: WebcamEditor['camera'];
  commands: WebcamTrackCommands;
  projection: ReviewTrackProjection;
  compact: boolean;
  hiddenEnabled: string;
  selectedHiddenId: string | undefined;
  selectedPositionId: string | undefined;
  locale: ReturnType<typeof useAppLocale>;
}) {
  const { projection, camera } = props;
  const editor = props.commands;
  const compact = props.compact ?? false;
  const metrics = reviewTrackMetrics(compact);
  if (!camera)
    return (
      <ReviewTrackRow
        placeholder
        track="webcam"
        label={translate('gallery.videoReview.webcam')}
        icon={Camera}
      >
        <div className="h-8" />
      </ReviewTrackRow>
    );
  const admit = props.commands.admit;
  return (
    <ReviewTrackRow
      track="webcam"
      muted={!camera.enabled}
      label={translate('gallery.videoReview.webcam')}
      icon={Camera}
      controls={
        <>
          <ReviewTrackVisibilityButton
            track="webcam"
            label={translate('gallery.videoReview.webcamApply')}
            className={reviewCompactTrackButtonClassName}
            enabled={camera.enabled}
            onToggle={() => admit(() => void editor.toggle())}
            icon={camera.enabled ? Eye : EyeOff}
          />
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
          camera={camera}
          commands={props.commands}
          hiddenEnabled={props.hiddenEnabled}
          selectedHiddenId={props.selectedHiddenId}
          selectedPositionId={props.selectedPositionId}
          duration={projection.display.duration}
          admit={admit}
          compact={compact}
        />
      </div>
    </ReviewTrackRow>
  );
});

/** Authored hide ranges and position anchors share the track's source axis and admission. */
function ReviewWebcamTrackMarkers({
  camera,
  commands,
  hiddenEnabled,
  selectedHiddenId,
  selectedPositionId,
  duration,
  admit,
  compact,
}: {
  camera: NonNullable<WebcamEditor['camera']>;
  commands: WebcamTrackCommands;
  hiddenEnabled: string;
  selectedHiddenId: string | undefined;
  selectedPositionId: string | undefined;
  duration: number;
  admit: ReviewBeforeAction;
  compact: boolean;
}) {
  return (
    <>
      {camera.hiddenRanges.map((range, index) => (
        <ReviewWebcamHiddenMarker
          key={range.id}
          ranges={camera.hiddenRanges}
          selected={selectedHiddenId === range.id}
          enabled={hiddenEnabled[index] === '1'}
          commands={commands}
          id={range.id}
          duration={duration}
          admit={admit}
          compact={compact}
        />
      ))}
      {camera.positions.map((position, index) => (
        <ReviewWebcamPositionMarker
          key={position.id}
          camera={camera}
          selected={selectedPositionId === position.id}
          commands={commands}
          index={index}
          duration={duration}
          admit={admit}
        />
      ))}
    </>
  );
}
