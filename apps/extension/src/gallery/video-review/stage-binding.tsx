import type { RefObject } from 'react';
import { useCallback, useRef } from 'react';
import { evaluateQuickEditCameraAtTime } from '../../features/video/review/advanced/scene';
import type {
  QuickEditBackgroundSettings,
  QuickEditCameraTransform,
} from '../../features/video/review/advanced/types';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
import type {
  CanvasComment,
  ReviewAnnotation,
  ReviewRegion,
  ReviewSource,
} from '../../features/video/review/types';
import type { useCanvasComments } from './use-canvas-comments';
import { ReviewStage } from './stage';
import { useReviewBackgroundImage } from './use-review-background';
import { ReviewButton } from './controls';
import { translate } from '../../platform/i18n';

/**
 * One stage binding: the applied scene (background plus the camera at the represented
 * frame), the selected focus handle, and the overlay stack. Effective regions already
 * exclude disabled lanes; selection itself never changes the applied pixels.
 */
export function ReviewStageBinding(props: {
  backgroundPending?: boolean;
  url: string;
  source: ReviewSource;
  canvas?: { width: number; height: number } | undefined;
  video: RefObject<HTMLVideoElement | null>;
  drawing: boolean;
  region: ReviewRegion | undefined;
  zoomRegions: readonly QuickEditZoomRegion[];
  background: QuickEditBackgroundSettings;
  outputTime: number;
  zoomOverlay:
    | {
        camera: QuickEditCameraTransform;
        onDrag(point: { x: number; y: number }): void;
      }
    | undefined;
  comments: readonly CanvasComment[];
  annotations: readonly ReviewAnnotation[];
  canvasComments: ReturnType<typeof useCanvasComments>;
  /** Editor-only overlay display; false hides the stack without touching data. */
  overlaysVisible: boolean;
  time: number;
  busy: boolean;
  onRegion(value: ReviewRegion): void;
  onReady(): void;
  onTime(value: number): void;
  onPlaying(value: boolean): void;
  onError(): void;
}) {
  const image = useReviewBackgroundImage(props.background, props.backgroundPending);
  const camera: QuickEditCameraTransform = props.zoomRegions.length
    ? evaluateQuickEditCameraAtTime(props.zoomRegions, props.outputTime)
    : { scale: 1, centerX: 0.5, centerY: 0.5 };
  const geometryRef = useRef<{
    output: { width: number; height: number };
    videoTransform: { x: number; y: number; width: number; height: number } | null;
  } | null>(null);
  const onGeometry = useCallback(
    (geometry: {
      output: { width: number; height: number };
      videoTransform: { x: number; y: number; width: number; height: number } | null;
    }) => {
      const previous = geometryRef.current;
      if (
        previous &&
        previous.output.width === geometry.output.width &&
        previous.output.height === geometry.output.height &&
        previous.videoTransform?.x === geometry.videoTransform?.x &&
        previous.videoTransform?.y === geometry.videoTransform?.y &&
        previous.videoTransform?.width === geometry.videoTransform?.width &&
        previous.videoTransform?.height === geometry.videoTransform?.height
      )
        return;
      geometryRef.current = geometry;
      props.canvasComments.setGeometry(geometry);
    },
    [props.canvasComments]
  );
  return (
    <>
      {image.failed ? (
        <div role="alert" className="flex items-center gap-2 text-sm">
          <span>{translate('gallery.videoReview.backgroundLoadFailed')}</span>
          <ReviewButton label={translate('gallery.videoReview.retry')} onClick={image.retry} />
        </div>
      ) : null}
      <ReviewStage
        backgroundImageUrl={image.url}
        url={props.url}
        source={props.source}
        video={props.video}
        drawing={props.drawing}
        region={props.region}
        scene={{
          background: props.background,
          camera,
          canvas: props.canvas,
          focus: { regions: props.zoomRegions, time: props.outputTime },
        }}
        {...(props.zoomOverlay ? { zoom: props.zoomOverlay } : {})}
        comments={{
          items: props.overlaysVisible ? props.comments : [],
          annotations: props.annotations,
          time: props.time,
          background: props.background,
          camera: props.zoomRegions.length ? camera : null,
          selectedId: props.canvasComments.selectedId,
          busy: props.busy,
          onSelect: props.canvasComments.onSelect,
          onGeometry,
          onMove: (id, position) => {
            const comment = props.comments.find((item) => item.id === id);
            if (comment) void props.canvasComments.onPatch(comment, { position });
          },
        }}
        onRegion={props.onRegion}
        onReady={props.onReady}
        onTime={props.onTime}
        onPlaying={props.onPlaying}
        onError={props.onError}
      />
    </>
  );
}
