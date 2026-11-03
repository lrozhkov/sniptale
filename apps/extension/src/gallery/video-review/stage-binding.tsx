import { prepareReviewCameraPlans } from '../../features/video/review/advanced/camera-plan-preparation';
import { projectReviewFocus } from '../../features/video/review/focus-edits';
import type { ReviewTimeSegment } from '../../features/video/review/timeline';
import type { ReviewCutPreviewBinding } from './cut-transition-preview';
import type { RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createReviewPreviewPresentation,
  createReviewPresentationPaintClock,
} from './preview-presentation';
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
/** Adapt a selected framing draft to the display camera and stable playback topology. */
function useReviewStageCamera(
  props: Pick<
    ReviewStageBindingProps,
    | 'url'
    | 'onError'
    | 'zoomOverlay'
    | 'focusTimeMap'
    | 'outputTime'
    | 'preview'
    | 'zoomRegions'
    | 'source'
    | 'canvas'
    | 'background'
    | 'windowHeader'
  >
) {
  const selected = props.zoomOverlay?.region;
  const projected = useMemo(
    () => (selected ? projectReviewFocus([selected], props.focusTimeMap) : []),
    [selected, props.focusTimeMap]
  );
  const framing =
    projected.length > 0 &&
    Math.abs(props.outputTime - (projected[0]!.start + projected.at(-1)!.end) / 2) < 0.05;
  const manualCamera =
    framing &&
    !props.preview?.playing &&
    selected &&
    !selected.border &&
    !selected.spotlight &&
    !selected.followCursor &&
    projected.every(
      (target) =>
        props.zoomRegions.find((region) => region.id === target.id)?.cursorFocus?.path.mode !==
        'follow'
    )
      ? selected.transform
      : undefined;
  const regions = useMemo(
    () =>
      projected.length === 0
        ? props.zoomRegions
        : props.zoomRegions.map((region) => {
            const target = projected.find((item) => item.id === region.id);
            if (!target) return region;
            // Resolved links belong to the complete scene, not the isolated selected projection.
            // A framing draft changes the displayed pose, not neighboring playback trajectories.
            const updated = {
              ...region,
              ...target,
              ...(manualCamera ? { transform: region.transform } : {}),
            };
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
          }),
    [projected, props.zoomRegions, manualCamera, framing]
  );
  const cameraScene = useMemo(() => {
    const input = {
      source: props.source,
      canvas: props.canvas,
      background: props.background,
      windowHeader: props.windowHeader,
    };
    return input;
  }, [props.source, props.canvas, props.background, props.windowHeader]);
  const request = useMemo(() => ({ regions, input: cameraScene }), [regions, cameraScene]);
  const needsPlan = regions.some((region) => region.cursorFocus?.path.mode === 'follow');
  const [completed, setCompleted] = useState<{ owner: object; request: typeof request } | null>(
    null
  );
  const reportError = useRef(props.onError);
  reportError.current = props.onError;
  const lifetime = useMemo(
    () => ({ url: props.url, width: props.source.width, height: props.source.height }),
    [props.url, props.source.width, props.source.height]
  );
  const owner = useMemo(() => {
    const identity = lifetime;
    const lease = <T,>(value: T) => ({ value, release() {} });
    const scheduler = createReviewPreviewPresentation<
      typeof request,
      typeof request,
      null,
      typeof request
    >({
      ...createReviewPresentationPaintClock(),
      now: () => performance.now(),
      sampleTime: () => 0,
      prepare: async ({ scene }, signal) => {
        signal.throwIfAborted();
        prepareReviewCameraPlans(scene.regions, scene.input);
        signal.throwIfAborted();
        return lease(scene);
      },
      capture: () => lease(null),
      render: (prepared) => lease(prepared),
      publish: (value) => setCompleted({ owner: identity, request: value }),
      onError: () => reportError.current(),
    });
    return { identity, scheduler };
  }, [lifetime]);
  useEffect(() => () => owner.scheduler.dispose(), [owner]);
  useEffect(() => {
    owner.scheduler.update({
      scene: request,
      generation: 'stage-camera',
      visible: needsPlan,
      playing: false,
      interacting: false,
      frameRate: null,
      detailedPaused: false,
      pausedTime: 0,
    });
  }, [owner, request, needsPlan]);
  const ready =
    !needsPlan || (completed?.owner === owner.identity && completed.request === request);
  const lastCamera = useRef<{ owner: object; camera: QuickEditCameraTransform } | null>(null);
  // Evaluate the complete composition with the draft pose, without preparing new playback plans.
  const displayedRegions = manualCamera
    ? regions.map((region) =>
        projected.some((target) => target.id === region.id)
          ? { ...region, transform: manualCamera }
          : region
      )
    : regions;
  const camera: QuickEditCameraTransform = !ready
    ? lastCamera.current?.owner === owner.identity
      ? lastCamera.current.camera
      : { scale: 1, centerX: 0.5, centerY: 0.5 }
    : displayedRegions.length
      ? evaluateQuickEditCameraAtTime(displayedRegions, props.outputTime, cameraScene)
      : { scale: 1, centerX: 0.5, centerY: 0.5 };
  if (ready) lastCamera.current = { owner: owner.identity, camera };
  const retained = !ready && completed?.owner === owner.identity ? completed.request : request;
  return { camera, regions: retained.regions, sceneInput: retained.input };
}

export function ReviewStageBinding(props: ReviewStageBindingProps) {
  const { camera, regions, sceneInput } = useReviewStageCamera(props);
  const image = useReviewBackgroundImage(sceneInput.background, props.backgroundPending);
  const geometryRef = useRef<{
    output: { width: number; height: number };
    projection?:
      | import('../../features/video/composition/motion/spatial-geometry').QuickEditHomography
      | undefined;
    videoTransform: { x: number; y: number; width: number; height: number } | null;
  } | null>(null);
  const onGeometry = useCallback(
    (geometry: {
      output: { width: number; height: number };
      projection?:
        | import('../../features/video/composition/motion/spatial-geometry').QuickEditHomography
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
          background: sceneInput.background,
          camera,
          canvas: sceneInput.canvas,
          windowHeader: sceneInput.windowHeader,
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
