import { projectReviewFocus } from '../../features/video/review/focus-edits';
import type { ReviewTimeSegment } from '../../features/video/review/timeline';
import type { ReviewCutPreviewBinding } from './cut-transition-preview';
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
import type { ReviewStageFocus, ReviewStageFocusPicker } from './stage-focus';
import { useReviewBackgroundImage } from './use-review-background';
import { ReviewButton } from './controls';
import { translate } from '../../platform/i18n';
import type { ReviewWebcamStageBinding } from './webcam-overlay';

/**
 * One stage binding: the applied scene (background plus the camera at the represented
 * frame), the selected focus handle, and the overlay stack. Effective regions already
 * exclude disabled lanes. The paused framing midpoint shows the full selected target.
 */
type ReviewStageBindingProps = {
  cursorPath?: Parameters<typeof ReviewStage>[0]['cursorPath'];
  captions?: Parameters<typeof ReviewStage>[0]['captions'];
  annotationEffects?: Parameters<typeof ReviewStage>[0]['annotationEffects'];
  annotationEditing?: Parameters<typeof ReviewStage>[0]['annotationEditing'];
  onAnnotationGeometry?: Parameters<typeof ReviewStage>[0]['onAnnotationGeometry'];
  readAsset?: Parameters<typeof ReviewStage>[0]['readAsset'];
  onCaptionSelect?: Parameters<typeof ReviewStage>[0]['onCaptionSelect'];
  outerFadePlan?: Parameters<typeof ReviewStage>[0]['outerFadePlan'] | undefined;
  preview?: Parameters<typeof ReviewStage>[0]['preview'] | undefined;
  watermark?: Parameters<typeof ReviewStage>[0]['watermark'] | undefined;
  keyCues?: readonly import('../../features/video/review/key-animation').ReviewKeyCue[] | undefined;
  clickCues?:
    | readonly import('../../features/video/review/click-animation').ReviewClickCue[]
    | undefined;
  webcam?: ReviewWebcamStageBinding | undefined;
  backgroundPending?: boolean;
  cutPreview?: ReviewCutPreviewBinding | undefined;
  url: string;
  source: ReviewSource;
  canvas?: { width: number; height: number } | undefined;
  windowHeader?:
    | import('../../features/video/review/advanced/types').QuickEditWindowHeader
    | undefined;
  video: RefObject<HTMLVideoElement | null>;
  drawing: boolean;
  region: ReviewRegion | undefined;
  zoomRegions: readonly QuickEditZoomRegion[];
  background: QuickEditBackgroundSettings;
  outputTime: number;
  zoomOverlay: ReviewStageFocus | undefined;
  focusPicker?: ReviewStageFocusPicker | undefined;
  focusTimeMap?: readonly ReviewTimeSegment[] | undefined;
  comments: readonly CanvasComment[];
  annotations: readonly ReviewAnnotation[];
  canvasComments: Pick<
    ReturnType<typeof useCanvasComments>,
    'setGeometry' | 'selectedId' | 'onSelect' | 'onPatch'
  >;
  /** Editor-only overlay display; false hides the stack without touching data. */
  overlaysVisible: boolean;
  time: number;
  busy: boolean;
  onRegion(value: ReviewRegion): void;
  onReady(): void;
  onTime(value: number): void;
  onPlaying(value: boolean): void;
  onEnded?: (() => void) | undefined;
  onError(): void;
};
export function ReviewStageBinding(props: ReviewStageBindingProps) {
  const image = useReviewBackgroundImage(props.background, props.backgroundPending);
  const selected = props.zoomOverlay?.region;
  const projected = selected ? projectReviewFocus([selected], props.focusTimeMap) : [];
  const framing =
    projected.length > 0 &&
    Math.abs(props.outputTime - (projected[0]!.start + projected.at(-1)!.end) / 2) < 0.05;
  const regions = props.zoomRegions.map((region) => {
    const target = projected.find((item) => item.id === region.id);
    if (!target) return region;
    // Resolved links belong to the complete scene, not the isolated selected projection.
    const updated = { ...region, ...target };
    if (!framing) return updated;
    return {
      ...updated,
      enter: { type: 'none' as const, duration: 0 },
      exit: { type: 'none' as const, duration: 0 },
      ...(target.borderClock
        ? {
            borderClock: {
              ...target.borderClock,
              enter: { type: 'none' as const, duration: 0 },
              exit: { type: 'none' as const, duration: 0 },
            },
          }
        : {}),
    };
  });
  const camera: QuickEditCameraTransform = regions.length
    ? evaluateQuickEditCameraAtTime(regions, props.outputTime, {
        source: props.source,
        canvas: props.canvas,
        background: props.background,
        windowHeader: props.windowHeader,
      })
    : { scale: 1, centerX: 0.5, centerY: 0.5 };
  const geometryRef = useRef<{
    output: { width: number; height: number };
    projection?:
      | import('../../features/video/review/advanced/spatial-geometry').QuickEditHomography
      | undefined;
    videoTransform: { x: number; y: number; width: number; height: number } | null;
  } | null>(null);
  const onGeometry = useCallback(
    (geometry: {
      output: { width: number; height: number };
      projection?:
        | import('../../features/video/review/advanced/spatial-geometry').QuickEditHomography
        | undefined;
      videoTransform: { x: number; y: number; width: number; height: number } | null;
    }) => {
      const previous = geometryRef.current;
      if (
        previous &&
        JSON.stringify(previous.projection) === JSON.stringify(geometry.projection) &&
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
        captions={props.captions}
        annotationEffects={props.annotationEffects}
        annotationEditing={props.annotationEditing}
        onAnnotationGeometry={props.onAnnotationGeometry}
        readAsset={props.readAsset}
        onCaptionSelect={props.onCaptionSelect}
        outerFadePlan={props.outerFadePlan}
        preview={props.preview}
        watermark={props.watermark}
        keyCues={props.keyCues}
        clickCues={props.clickCues}
        webcam={props.webcam}
        focusPicker={props.focusPicker}
        cursorPath={props.cursorPath}
        backgroundImageUrl={image.url}
        backgroundPending={props.backgroundPending}
        cutPreview={props.cutPreview}
        url={props.url}
        source={props.source}
        video={props.video}
        drawing={props.drawing}
        region={props.region}
        scene={{
          background: props.background,
          camera,
          canvas: props.canvas,
          windowHeader: props.windowHeader,
          focus: { regions, time: props.outputTime },
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
        onEnded={props.onEnded}
        onError={props.onError}
      />
    </>
  );
}
