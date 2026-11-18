import { ReviewCursorMotionOverlay } from './cursor-motion-overlay';
import type { ReviewPreviewRendererStatus } from './preview-presentation-state';
import {
  reviewPresentedStageProjection,
  type ReviewPresentedGeometry,
} from '../../workflows/video-review/gpu-preview-geometry';
import { ReviewSceneVideo, ReviewRegionOverlay } from './stage-video';
import { ReviewCursorPathOverlay } from './cursor-path-overlay';
import {
  ReviewAnnotationOverlay,
  type ReviewAnnotationEditing,
} from './annotation-effects-overlay';
import {
  presentationMainColorOpacity,
  presentationMainColor,
  type PresentationSequencePlan,
} from '../../features/video/review/presentation-sequence';
import {
  useStagePresentation,
  ReviewStagePresentationFeedback,
  ReviewHeaderFailure,
} from './stage-presentation';
import type { QuickPreviewPreferences } from '../../features/video/preview/quick-preferences';
import {
  type useReviewStageGeometry,
  reviewStageCommentGeometry,
  useReviewStageViewport,
  resolveReviewStageGeometry,
  resolveReviewClickRaster,
  type ReviewStageScene,
  type ReviewStageCommentGeometry,
} from './stage-geometry';
import { ReviewWatermarkOverlay } from './watermark-overlay';
import { ReviewKeyOverlay } from './key-animation-overlay';
import { ReviewStageBackground } from './background-blur-preview';
import {
  quickEditPlaneProjection,
  quickEditProjectionCss,
  invertQuickEditProjection,
} from '../../features/video/composition/motion/spatial-geometry';
import { ReviewClickOverlay } from './click-animation-overlay';
import type { ReviewClickCue } from '../../features/video/review/click-animation';
import { ReviewMotionBlurPreview } from './motion-blur-preview';
import { ReviewBorderOverlay } from './border-overlay';
import { ReviewWebcamOverlay, type ReviewWebcamStageBinding } from './webcam-overlay';
import { useReviewWindowHeader } from './use-window-header';
import {
  ReviewCutBlackout,
  type ReviewCutPreviewBinding,
  type ReviewCutPreviewRaster,
} from './cut-transition-preview';
import {
  ReviewStageFocusControl,
  ReviewStageFocusTargets,
  type ReviewStageFocus,
  type ReviewStageFocusPicker,
} from './stage-focus';
import { ReviewSpotlightOverlay } from './spotlight-overlay';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from 'react';
import { projectVideoRegion } from '../../features/video/review/geometry';
import type {
  CanvasComment,
  ReviewAnnotation,
  ReviewRegion,
  ReviewSource,
} from '../../features/video/review/types';
import {
  type computeQuickEditSceneLayout,
  computeQuickEditSpatialWindow,
  computeQuickEditSceneSize,
  computeQuickEditSourceWindowTransform,
  computeQuickEditSceneCamera,
} from '../../features/video/review/advanced/scene';
import type {
  QuickEditBackgroundSettings,
  QuickEditCameraTransform,
} from '../../features/video/review/advanced/types';
import { ReviewCommentOverlay } from './comment-overlay';
import { useReviewDrawingPlane } from './stage-drawing';

type ReviewStageCommentBinding = {
  items: readonly CanvasComment[];
  annotations: readonly ReviewAnnotation[];
  time: number;
  background: QuickEditBackgroundSettings;
  camera: QuickEditCameraTransform | null;
  selectedId: string | null;
  busy: boolean;
  onSelect(id: string): void;
  onMove(id: string, position: { x: number; y: number }): void;
  /** Reports the stage geometry for attachment switching; null hides overlays. */
  onGeometry?(geometry: ReviewStageCommentGeometry): void;
};

type ReviewStageProps = {
  previewOverlay?: ReactNode;
  cursorMotions?: import('../../features/video/project/cursor-motion').CursorMotion[] | undefined;
  cursorPath?: Omit<Parameters<typeof ReviewCursorPathOverlay>[0], 'width' | 'height'> | undefined;
  annotationEditing?: ReviewAnnotationEditing | undefined;
  onAnnotationGeometry?: ReviewAnnotationEditing['editor']['setGeometry'] | undefined;
  captions?: Parameters<typeof useStagePresentation>[0]['captions'];
  annotationEffects?: Parameters<typeof useStagePresentation>[0]['annotationEffects'];
  readAsset?: Parameters<typeof useStagePresentation>[0]['readAsset'];
  onCaptionSelect?: ((id: string) => void) | undefined;
  preview?:
    | {
        preferences: QuickPreviewPreferences;
        playing: boolean;
        onPresentationActive?: (sourceIdentity: string, active: boolean) => void;
        onPresentedTime?: ((sourceIdentity: string, resultTime: number) => void) | undefined;
        interacting?: boolean;
        sourceToResult(time: number): number | null;
        readPosition?: NonNullable<
          Parameters<typeof useStagePresentation>[0]['preview']
        >['readPosition'];
        seekRevision?: number | undefined;
        onRendererStatus?: ((status: ReviewPreviewRendererStatus | null) => void) | undefined;
        onRaster?: ((size: { width: number; height: number } | null) => void) | undefined;
        sourceFrameRate?: number | undefined;
        waitingReason?: string | undefined;
      }
    | undefined;
  outerFadePlan?: PresentationSequencePlan | undefined;
  watermark?: Omit<Parameters<typeof ReviewWatermarkOverlay>[0], 'output'> | undefined;
  keyCues?: readonly import('../../features/video/review/key-animation').ReviewKeyCue[] | undefined;
  clickCues?: readonly ReviewClickCue[] | undefined;
  webcam?: ReviewWebcamStageBinding | undefined;
  backgroundImageUrl?: string | undefined;
  backgroundPending?: boolean | undefined;
  cutPreview?: ReviewCutPreviewBinding | undefined;
  onCutRaster?: ((raster: ReviewCutPreviewRaster) => void) | undefined;
  url: string;
  source: ReviewSource;
  video: RefObject<HTMLVideoElement | null>;
  drawing: boolean;
  region: ReviewRegion | undefined;
  /** One scene: applied background and the camera at the represented frame. */
  scene?: ReviewStageScene;
  /** Selected focus controls; disabled during playback and export by the binding. */
  zoom?: ReviewStageFocus;
  focusPicker?: ReviewStageFocusPicker | undefined;
  comments?: ReviewStageCommentBinding;
  onRegion(value: ReviewRegion): void;
  onReady(): void;
  onMediaReady?: Parameters<typeof ReviewSceneVideo>[0]['onMediaReady'];
  onTime(time: number): void;
  onPlaying(value: boolean): void;
  onEnded?: (() => void) | undefined;
  onError(): void;
};

/** Native artwork resources change with authored header geometry, not camera receipts. */
function useStageHeader(
  props: Pick<ReviewStageProps, 'source' | 'scene'>,
  sceneLayout: ReturnType<typeof useReviewStageGeometry>['sceneLayout']
) {
  // Match the SVG viewport to the fitted header allocation, including its rounded toolbar rows.
  // A source-rounded SVG in a differently shaped img box otherwise gains internal letterboxing.
  const headerDisplayHeight = sceneLayout
    ? Math.round(
        ((((sceneLayout.visibleVideoRect ?? sceneLayout.videoRect).y - sceneLayout.windowRect.y) *
          props.source.width) /
          (sceneLayout.visibleVideoRect ?? sceneLayout.videoRect).width) *
          1e6
      ) / 1e6
    : undefined;
  return useReviewWindowHeader(
    props.scene?.windowHeader,
    props.source.width,
    props.source.height,
    headerDisplayHeight
  );
}

function reviewStageProjections(
  props: Pick<ReviewStageProps, 'scene'>,
  sceneLayout: ReturnType<typeof useReviewStageGeometry>['sceneLayout'],
  presented: ReviewPresentedGeometry | null | undefined,
  output: { width: number; height: number }
) {
  const motion =
    sceneLayout && props.scene
      ? computeQuickEditSceneCamera(sceneLayout, props.scene.background)
      : { x: 0, y: 0, scale: 1, backgroundScale: 1 };
  const window = sceneLayout
    ? computeQuickEditSpatialWindow(sceneLayout, props.scene?.background ?? { enabled: false })
    : null;
  const projection =
    sceneLayout?.spatial && presented && output
      ? reviewPresentedStageProjection(presented, output)
      : sceneLayout?.spatial && window
        ? quickEditPlaneProjection(window, window, sceneLayout.spatial)
        : undefined;
  const windowProjection =
    sceneLayout?.spatial && presented && output
      ? reviewPresentedStageProjection(presented, output, 'window')
      : projection;
  return { motion, projection, windowProjection };
}

/** Pointer inversion and local drafts follow only the accepted overlay geometry. */
function useStageInteractionGeometry(
  props: Pick<ReviewStageProps, 'source' | 'scene' | 'drawing' | 'region' | 'onRegion' | 'video'>,
  geometry: Pick<ReturnType<typeof useReviewStageGeometry>, 'sceneLayout' | 'content'>,
  presented: ReviewPresentedGeometry | null | undefined,
  output: { width: number; height: number }
) {
  const { sceneLayout, content } = geometry;
  const { motion, projection, windowProjection } = reviewStageProjections(
    props,
    sceneLayout,
    presented,
    output
  );
  const plane = useReviewDrawingPlane({
    crop: sceneLayout?.sourceCrop,
    inverseProjection: projection
      ? (invertQuickEditProjection(projection) ?? undefined)
      : undefined,
    drawing: props.drawing,
    content,
    region: props.region,
    onRegion: props.onRegion,
    pause: () => props.video.current?.pause(),
  });
  const projected = plane.drag
    ? projectVideoRegion(plane.drag, content)
    : props.region
      ? projectVideoRegion(props.region, content)
      : null;
  return { motion, projection, windowProjection, plane, projected };
}

type StageGeometrySource = ReturnType<typeof createStageGeometrySource>;
type StageDrawingHandlers = ReturnType<typeof useReviewDrawingPlane>;

/** The publication owner already validates frames; this mounted source routes their UI consumers. */
function createStageGeometrySource(source: string) {
  let active = false;
  let current: {
    geometry: ReviewPresentedGeometry | null;
    sourceTime: number | undefined;
    resultTime: number | undefined;
  } | null = null;
  let structure: ReviewPresentedGeometry | null = null;
  let structureKey = '';
  const listeners = new Set<() => void>();
  const structuralListeners = new Set<() => void>();
  return {
    read: () => current,
    readStructure: () => structure,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    subscribeStructure(listener: () => void) {
      structuralListeners.add(listener);
      return () => {
        structuralListeners.delete(listener);
      };
    },
    activate() {
      active = true;
    },
    dispose() {
      active = false;
      current = null;
      structure = null;
      structureKey = '';
    },
    publish(
      geometry: ReviewPresentedGeometry | null,
      identity: string | undefined,
      sourceTime?: number,
      resultTime = geometry?.resultTime
    ) {
      if (!active || (identity !== undefined && identity !== source)) return false;
      if (
        current?.geometry === geometry &&
        current.sourceTime === sourceTime &&
        current.resultTime === resultTime
      )
        return true;
      current =
        geometry === null && sourceTime === undefined ? null : { geometry, sourceTime, resultTime };
      // Canonical aspect and authored frame shell can change while a prior front stays visible.
      const key = geometry
        ? JSON.stringify([
            geometry.logical,
            geometry.scene.background,
            geometry.scene.canvas,
            geometry.scene.windowHeader,
          ])
        : '';
      if (key !== structureKey) {
        structureKey = key;
        structure = geometry;
        for (const listener of structuralListeners) listener();
      }
      for (const listener of listeners) listener();
      return true;
    },
  };
}

function representedStageProps(props: ReviewStageProps, presented: ReviewPresentedGeometry | null) {
  return presented && props.scene
    ? {
        ...props,
        scene: {
          ...props.scene,
          ...presented.scene,
          canvas: presented.scene.canvas,
          windowHeader: presented.scene.windowHeader,
          camera: presented.camera,
          ...(props.scene.focus
            ? {
                focus: {
                  ...props.scene.focus,
                  regions: presented.scene.zoomRegions,
                  time: presented.resultTime,
                },
              }
            : {}),
        },
      }
    : props;
}

/** One stage binding: the applied scene, drawing plane, and overlay comment stack. */
export function ReviewStage(props: ReviewStageProps) {
  const host = useRef<HTMLDivElement>(null);
  const publication = useRef<HTMLDivElement>(null);
  const geometrySource = useMemo(() => createStageGeometrySource(props.url), [props.url]);
  useLayoutEffect(() => {
    geometrySource.activate();
    return () => geometrySource.dispose();
  }, [geometrySource]);
  const presented = useSyncExternalStore(
    geometrySource.subscribeStructure,
    geometrySource.readStructure
  );
  const representedProps = representedStageProps(props, presented);
  const onPresentedTime = props.preview?.onPresentedTime;
  const receiveGeometry = useCallback(
    (geometry: ReviewPresentedGeometry | null, sourceTime?: number, sourceIdentity?: string) => {
      if (geometrySource.publish(geometry, sourceIdentity, sourceTime) && geometry)
        onPresentedTime?.(props.url, geometry.resultTime);
    },
    [geometrySource, props.url, onPresentedTime]
  );
  const viewport = useReviewStageViewport(host);
  const drawingHandlers = useRef<StageDrawingHandlers | null>(null);
  const reportInputs = useRef({ props, viewport });
  const reportGeometry = useCallback(() => {
    const current = reportInputs.current;
    const accepted = geometrySource.read()?.geometry ?? null;
    const represented = representedStageProps(current.props, accepted);
    const geometry = resolveReviewStageGeometry(represented, current.viewport, accepted);
    const comments = reviewStageCommentGeometry(represented, geometry, accepted);
    if (comments) current.props.comments?.onGeometry?.(comments);
    (current.props.onAnnotationGeometry ?? current.props.annotationEditing?.editor.setGeometry)?.(
      geometry.annotationGeometry
    );
  }, [geometrySource]);
  useLayoutEffect(() => {
    reportInputs.current = { props, viewport };
    reportGeometry();
  });
  useLayoutEffect(() => geometrySource.subscribe(reportGeometry), [geometrySource, reportGeometry]);

  const [cutRaster, setCutRaster] = useState<ReviewCutPreviewRaster>({
    active: false,
    frame: null,
  });
  const displayedGeometry = resolveReviewStageGeometry(representedProps, viewport, presented);
  const { size, watermarkOutput, sceneLayout, backgroundPaint, spotlight, overlayClip } =
    displayedGeometry;
  const requestedGeometry = presented
    ? resolveReviewStageGeometry(props, viewport)
    : displayedGeometry;
  const { presentation, beginInteraction } = useStagePresentation(
    props,
    publication,
    requestedGeometry.watermarkOutput,
    requestedGeometry.size,
    receiveGeometry
  );
  const sourceToResult = props.preview?.sourceToResult;
  const readPosition = props.preview?.readPosition;
  const nativeComments = !presentation.active && (props.comments?.items.length ?? 0) > 0;
  useEffect(() => {
    const video = props.video.current;
    if (presentation.active || !video || (!onPresentedTime && !nativeComments)) return;
    let disposed = false;
    let frame: number | null = null;
    let paint: number | null = null;
    let epoch = 0;
    let seekTarget: number | null = null;
    const publishNative = (sourceTime: number) => {
      if (readPosition?.().source?.kind === 'freeze') return;
      if (nativeComments)
        geometrySource.publish(
          null,
          props.url,
          sourceTime,
          sourceToResult?.(sourceTime) ?? undefined
        );
    };
    const confirmNative = (sourceTime: number) => {
      if (readPosition?.().source?.kind === 'freeze') return;
      const resultTime = sourceToResult?.(sourceTime);
      if (resultTime !== null && resultTime !== undefined) onPresentedTime?.(props.url, resultTime);
    };
    const cancel = () => {
      epoch++;
      if (frame !== null) video.cancelVideoFrameCallback(frame);
      if (paint !== null) cancelAnimationFrame(paint);
      frame = null;
      paint = null;
    };
    const observe = () => {
      if (frame !== null || typeof video.requestVideoFrameCallback !== 'function') return;
      const revision = epoch;
      frame = video.requestVideoFrameCallback((_now, metadata) => {
        if (disposed || revision !== epoch) return;
        frame = null;
        if (!video.seeking) {
          publishNative(
            Number.isFinite(metadata?.mediaTime) ? metadata.mediaTime : video.currentTime
          );
          if (seekTarget !== null && video.currentTime === seekTarget) {
            confirmNative(seekTarget);
            seekTarget = null;
          }
        }
        if (video.seeking || (nativeComments && props.preview?.playing)) observe();
      });
    };
    const seeking = () => {
      cancel();
      seekTarget = video.currentTime;
      observe();
    };
    const seeked = () => {
      if (typeof video.requestVideoFrameCallback === 'function') {
        observe();
        return;
      }
      const target = video.currentTime;
      const revision = epoch;
      paint = requestAnimationFrame(() => {
        paint = requestAnimationFrame(() => {
          paint = null;
          if (!disposed && revision === epoch && !video.seeking && video.currentTime === target) {
            publishNative(target);
            confirmNative(target);
          }
        });
      });
    };
    const nativeTime = () => {
      if (typeof video.requestVideoFrameCallback !== 'function' && !video.seeking)
        publishNative(video.currentTime);
    };
    video.addEventListener('seeking', seeking);
    video.addEventListener('seeked', seeked);
    video.addEventListener('loadeddata', seeked);
    if (nativeComments) {
      video.addEventListener('timeupdate', nativeTime);
      if (typeof video.requestVideoFrameCallback === 'function') observe();
      else nativeTime();
    }
    return () => {
      disposed = true;
      cancel();
      video.removeEventListener('seeking', seeking);
      video.removeEventListener('seeked', seeked);
      video.removeEventListener('loadeddata', seeked);
      video.removeEventListener('timeupdate', nativeTime);
    };
  }, [
    presentation.active,
    props.video,
    props.url,
    props.preview?.playing,
    sourceToResult,
    readPosition,
    onPresentedTime,
    nativeComments,
    geometrySource,
  ]);
  const manual = presentation.active && presentation.status.actualRaster !== null;
  const header = useStageHeader(representedProps, sceneLayout);
  const { motion, projection } = reviewStageProjections(
    representedProps,
    sceneLayout,
    presented,
    size
  );
  const getFrame = () => (cutRaster.active ? cutRaster.frame : props.video.current);
  const frame = (
    <ReviewStageFrame
      props={representedProps}
      geometry={{ sceneLayout, size, backgroundPaint, spotlight, overlayClip }}
      manual={manual}
      header={header}
      motion={motion}
      projection={projection}
      projected={
        !manual && props.region ? projectVideoRegion(props.region, displayedGeometry.content) : null
      }
      publication={publication}
      onCutRaster={setCutRaster}
      getFrame={getFrame}
    />
  );
  return (
    <div
      ref={host}
      data-ui="gallery.videoReview.workspaceSurface"
      style={{
        backgroundColor:
          'var(--sniptale-review-workspace-color, var(--sniptale-color-surface-canvas))',
      }}
      onPointerDownCapture={beginInteraction}
      className={[
        'relative min-h-36 flex-1 overflow-hidden rounded-[var(--sniptale-radius-sm)]',
        'bg-[var(--sniptale-color-surface-canvas)]',
      ].join(' ')}
    >
      <ReviewHeaderFailure failed={!manual && header.failed} retry={header.retry} />
      <div
        data-ui="gallery.videoReview.stage"
        className="absolute overflow-hidden bg-black"
        style={{
          left: size.x,
          top: size.y,
          width: size.width,
          height: size.height,
          cursor: props.drawing ? 'crosshair' : 'default',
          touchAction: props.drawing ? 'none' : 'auto',
        }}
        onPointerDown={(event) => drawingHandlers.current?.onPointerDown(event)}
        onPointerMove={(event) => drawingHandlers.current?.onPointerMove(event)}
        onPointerUp={(event) => drawingHandlers.current?.onPointerUp(event)}
        onPointerCancel={() => drawingHandlers.current?.onPointerCancel()}
      >
        <ReviewStageGeometryLayers
          props={props}
          source={geometrySource}
          viewport={viewport}
          manual={manual}
          header={header}
          drawingHandlers={drawingHandlers}
          frame={frame}
          publication={publication}
          onCutRaster={setCutRaster}
          getFrame={getFrame}
          onCommentPreview={presentation.onCommentPreview}
          beforeAnnotation={
            <>
              {props.webcam ? (
                <ReviewWebcamOverlay
                  binding={props.webcam}
                  main={props.video}
                  output={size}
                  manual={presentation.active ? presentation.webcamManual : undefined}
                  onPreviewPlacement={presentation.onWebcamPreview}
                />
              ) : null}
              {!manual ? (
                <ReviewKeyOverlay
                  cues={props.keyCues}
                  time={props.scene?.focus?.time ?? 0}
                  output={size}
                />
              ) : null}
              {props.watermark && (
                <ReviewWatermarkOverlay
                  {...props.watermark}
                  output={watermarkOutput}
                  manual={manual ? presentation.watermarkManual : undefined}
                />
              )}
              {!manual ? (
                <>
                  <ReviewCutBlackout binding={props.cutPreview} />
                  <ReviewStageOuterFade
                    plan={props.outerFadePlan}
                    time={props.scene?.focus?.time ?? 0}
                  />
                </>
              ) : null}
            </>
          }
          afterAnnotation={props.previewOverlay}
        />
      </div>
      <ReviewStagePresentationFeedback
        presentation={presentation}
        waitingReason={props.preview?.waitingReason}
        showFrameRate={props.preview?.preferences.showFrameRate ?? false}
        captions={props.captions}
        onCaptionSelect={props.onCaptionSelect}
      />
    </div>
  );
}

/** Only accepted geometry, hit targets and reporting subscribe at the publication cadence. */
function ReviewStageGeometryLayers({
  props,
  source,
  viewport,
  manual,
  header,
  drawingHandlers,
  frame,
  publication,
  onCutRaster,
  getFrame,
  onCommentPreview,
  beforeAnnotation,
  afterAnnotation,
}: {
  props: ReviewStageProps;
  source: StageGeometrySource;
  viewport: { width: number; height: number };
  manual: boolean;
  header: ReturnType<typeof useReviewWindowHeader>;
  drawingHandlers: RefObject<StageDrawingHandlers | null>;
  frame: ReactNode;
  publication: RefObject<HTMLDivElement | null>;
  onCutRaster(value: ReviewCutPreviewRaster): void;
  getFrame(): CanvasImageSource | null;
  onCommentPreview: ReturnType<typeof useStagePresentation>['presentation']['onCommentPreview'];
  beforeAnnotation: ReactNode;
  afterAnnotation: ReactNode;
}) {
  const visibleGeometry = !!(
    props.drawing ||
    props.region ||
    props.zoom ||
    props.focusPicker ||
    props.cursorPath ||
    props.annotationEditing ||
    props.comments?.items.length
  );
  const receipt = useSyncExternalStore(
    visibleGeometry ? source.subscribe : noStageGeometrySubscription,
    visibleGeometry ? source.read : noStageGeometrySnapshot
  );
  const presented = receipt?.geometry ?? null;
  const represented = representedStageProps(props, presented);
  const representedProps =
    props.comments && receipt?.sourceTime !== undefined
      ? {
          ...represented,
          comments: {
            ...props.comments,
            time: receipt.sourceTime,
            camera: presented?.camera ?? props.comments.camera,
          },
        }
      : represented;
  const geometry = resolveReviewStageGeometry(representedProps, viewport, presented);
  const {
    size,
    sceneLayout,
    zoomLayout,
    backgroundPaint,
    content,
    spotlight,
    borders,
    overlayClip,
  } = geometry;
  const annotationGeometry = geometry.annotationGeometry;
  const { motion, projection, windowProjection, plane, projected } = useStageInteractionGeometry(
    representedProps,
    { sceneLayout, content },
    presented,
    size
  );
  useLayoutEffect(() => {
    drawingHandlers.current = plane;
    return () => {
      if (drawingHandlers.current === plane) drawingHandlers.current = null;
    };
  }, [drawingHandlers, plane]);
  return (
    <>
      {manual || !props.drawing ? (
        frame
      ) : (
        <ReviewStageFrame
          props={representedProps}
          geometry={{ sceneLayout, size, backgroundPaint, spotlight, overlayClip }}
          manual={manual}
          header={header}
          motion={motion}
          projection={projection}
          projected={projected}
          publication={publication}
          onCutRaster={onCutRaster}
          getFrame={getFrame}
        />
      )}
      {manual && projected && !sceneLayout?.spatial ? (
        <ReviewRegionOverlay
          drawing={props.drawing}
          projected={projected}
          offset={{ x: 0, y: 0 }}
        />
      ) : null}
      <ReviewStageContent
        manual={manual}
        headerImage={header.image}
        onCommentPreview={onCommentPreview}
        getFrame={getFrame}
        props={representedProps}
        geometry={{ size, sceneLayout, zoomLayout, borders, overlayClip }}
        projection={projection}
        windowProjection={windowProjection}
        projected={projected}
      />
      <ReviewStageComments
        comments={representedProps.comments}
        attachment="viewport"
        visualMode={manual ? 'handles' : undefined}
        onPreviewPosition={onCommentPreview}
        output={size}
        source={props.source}
        layout={sceneLayout}
      />
      {beforeAnnotation}
      {props.annotationEditing && annotationGeometry && (
        <ReviewAnnotationOverlay
          binding={props.annotationEditing}
          geometry={annotationGeometry}
          size={size}
        />
      )}
      {afterAnnotation}
    </>
  );
}

/** Native composition uses the same global envelope as the final manual fill. */
function ReviewStageOuterFade({
  plan,
  time,
}: {
  plan: PresentationSequencePlan | undefined;
  time: number;
}) {
  if (!plan) return null;
  return (
    <div
      data-ui="gallery.videoReview.outerFade"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-40"
      style={{
        backgroundColor: presentationMainColor(plan, time),
        opacity: presentationMainColorOpacity(plan, time),
      }}
    />
  );
}

/** Native and published base pixels share geometry before sharp content and editing overlays. */
function ReviewStageFrame({
  props,
  geometry,
  manual,
  header,
  motion,
  projection,
  projected,
  publication,
  onCutRaster,
  getFrame,
}: {
  props: ReviewStageProps;
  geometry: Pick<
    ReturnType<typeof useReviewStageGeometry>,
    'sceneLayout' | 'size' | 'backgroundPaint' | 'spotlight' | 'overlayClip'
  >;
  manual: boolean;
  header: ReturnType<typeof useReviewWindowHeader>;
  motion: ReturnType<typeof useStageInteractionGeometry>['motion'];
  projection: ReturnType<typeof useStageInteractionGeometry>['projection'];
  projected: ReturnType<typeof useStageInteractionGeometry>['projected'];
  publication: RefObject<HTMLDivElement | null>;
  onCutRaster(value: ReviewCutPreviewRaster): void;
  getFrame(): CanvasImageSource | null;
}) {
  const { sceneLayout, size, backgroundPaint, spotlight, overlayClip } = geometry;
  return (
    <>
      {!manual ? (
        <ReviewStageBackground
          {...reviewBackgroundPlaneProps(props)}
          motion={motion}
          paint={backgroundPaint}
        />
      ) : null}
      <ReviewSceneVideo
        manual={manual}
        url={props.url}
        cutPreview={props.cutPreview}
        onCutRaster={onCutRaster}
        video={props.video}
        {...(props.scene ? { scene: props.scene } : {})}
        layout={sceneLayout}
        header={header}
        previewScale={size.width / Math.max(1, props.scene?.canvas?.width ?? props.source.width)}
        drawing={props.drawing}
        projected={projected}
        onReady={props.onReady}
        onMediaReady={props.onMediaReady}
        onTime={props.onTime}
        onPlaying={props.onPlaying}
        onEnded={props.onEnded}
        onError={props.onError}
      />
      {!manual ? (
        <ReviewStageNativeEffects
          props={props}
          geometry={{ sceneLayout, size, spotlight, overlayClip }}
          headerImage={header.image}
          projection={projection}
          getFrame={getFrame}
        />
      ) : null}
      <div
        ref={publication}
        data-ui="gallery.videoReview.manualPreview"
        className="pointer-events-none absolute inset-0"
        style={{ display: manual ? undefined : 'none' }}
      />
    </>
  );
}

/** Native-only optical effects consume the same frame and clip as the scene. */
function ReviewStageNativeEffects({
  props,
  geometry,
  headerImage,
  projection,
  getFrame,
}: {
  props: Pick<ReviewStageProps, 'drawing' | 'scene' | 'backgroundImageUrl' | 'source'>;
  geometry: Pick<
    ReturnType<typeof useReviewStageGeometry>,
    'sceneLayout' | 'size' | 'spotlight' | 'overlayClip'
  >;
  headerImage: ReturnType<typeof useReviewWindowHeader>['image'];
  projection: Parameters<typeof ReviewSpotlightOverlay>[0]['projection'];
  getFrame(): CanvasImageSource | null;
}) {
  const { sceneLayout, size, spotlight, overlayClip } = geometry;
  return (
    <>
      {(!props.drawing || sceneLayout?.spatial) && props.scene && sceneLayout ? (
        <ReviewMotionBlurPreview
          sourceFilters={props.scene.sourceFilters}
          sourceSize={props.source}
          scene={{ ...props.scene, source: props.source }}
          focus={props.scene.focus}
          camera={props.scene.camera}
          layout={sceneLayout}
          output={size}
          background={props.scene.background}
          imageUrl={props.backgroundImageUrl}
          headerImage={headerImage}
          sceneScale={size.width / Math.max(1, props.scene.canvas?.width ?? props.source.width)}
          getFrame={getFrame}
        />
      ) : null}
      <ReviewSpotlightOverlay
        projection={projection}
        output={size}
        frames={spotlight}
        clip={overlayClip}
      />
    </>
  );
}

/** Sharp content overlays and interaction targets share one projected plane. */
function ReviewStageContent({
  manual,
  headerImage,
  onCommentPreview,
  getFrame,
  props,
  geometry,
  projection,
  windowProjection,
  projected,
}: {
  manual: boolean;
  headerImage: ReturnType<typeof useReviewWindowHeader>['image'];
  onCommentPreview: ReturnType<typeof useStagePresentation>['presentation']['onCommentPreview'];
  getFrame(): CanvasImageSource | null;
  props: ReviewStageProps;
  geometry: Pick<
    ReturnType<typeof useReviewStageGeometry>,
    'size' | 'sceneLayout' | 'zoomLayout' | 'borders' | 'overlayClip'
  >;
  projection:
    | import('../../features/video/composition/motion/spatial-geometry').QuickEditHomography
    | undefined;
  windowProjection: ReturnType<typeof useStageInteractionGeometry>['projection'];
  projected: ReturnType<typeof projectVideoRegion> | null;
}) {
  const { size, sceneLayout, zoomLayout, borders, overlayClip } = geometry;
  const clickRaster =
    sceneLayout && props.scene && overlayClip
      ? resolveReviewClickRaster(sceneLayout, props.scene.background, overlayClip)
      : undefined;
  const windowFocus = !!props.zoom && !props.zoom.region.spotlight && !props.zoom.region.border;
  const focus =
    props.zoom && zoomLayout ? (
      <ReviewStageFocusControl
        scene={props.scene ? { ...props.scene, source: props.source } : undefined}
        projection={windowFocus ? windowProjection : projection}
        key={props.zoom.region.id}
        focus={props.zoom}
        behindTargets={!!props.focusPicker}
        layout={zoomLayout}
        output={size}
      />
    ) : null;
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0"
        style={
          projection
            ? { transformOrigin: '0 0', transform: quickEditProjectionCss(projection) }
            : undefined
        }
      >
        {sceneLayout?.spatial && projected ? (
          <ReviewRegionOverlay
            drawing={props.drawing}
            projected={projected}
            offset={{ x: 0, y: 0 }}
          />
        ) : null}
        {!manual ? <ReviewBorderOverlay output={size} frames={borders} clip={overlayClip} /> : null}
        {!manual ? (
          <ReviewClickOverlay
            getFrame={getFrame}
            cues={props.clickCues}
            time={props.scene?.focus?.time ?? 0}
            output={size}
            video={clickRaster?.video}
            sourceWidth={props.source.width}
            headerImage={headerImage}
            window={clickRaster?.window}
            clip={clickRaster?.clip}
            transform={clickRaster?.transform}
          />
        ) : null}
        <ReviewStageComments
          comments={props.comments}
          attachment="content"
          visualMode={manual ? 'handles' : undefined}
          onPreviewPosition={onCommentPreview}
          clip={projection || sceneLayout?.sourceCrop ? overlayClip : undefined}
          projection={projection}
          output={size}
          source={props.source}
          layout={sceneLayout}
        />
        {props.focusPicker && sceneLayout ? (
          <ReviewStageFocusTargets
            picker={props.focusPicker}
            clip={overlayClip}
            output={size}
            selectedId={props.zoom?.region.id}
            video={computeQuickEditSourceWindowTransform(sceneLayout)}
          />
        ) : null}
        {props.cursorPath && !props.cursorPath.authoredMotion && sceneLayout && !projection ? (
          <div
            className="pointer-events-none absolute"
            style={{
              left: sceneLayout.videoTransform.x,
              top: sceneLayout.videoTransform.y,
              width: sceneLayout.videoTransform.width,
              height: sceneLayout.videoTransform.height,
              clipPath: sceneLayout.sourceCrop
                ? `inset(${[
                    sceneLayout.sourceCrop.y,
                    1 - sceneLayout.sourceCrop.x - sceneLayout.sourceCrop.width,
                    1 - sceneLayout.sourceCrop.y - sceneLayout.sourceCrop.height,
                    sceneLayout.sourceCrop.x,
                  ]
                    .map((value) => `${value * 100}%`)
                    .join(' ')})`
                : undefined,
            }}
          >
            <ReviewCursorPathOverlay
              {...props.cursorPath}
              width={props.source.width}
              height={props.source.height}
              displayWidth={sceneLayout.videoTransform.width}
              bounds={{
                left: -sceneLayout.videoTransform.x / sceneLayout.videoTransform.width,
                top: -sceneLayout.videoTransform.y / sceneLayout.videoTransform.height,
                right:
                  (size.width - sceneLayout.videoTransform.x) / sceneLayout.videoTransform.width,
                bottom:
                  (size.height - sceneLayout.videoTransform.y) / sceneLayout.videoTransform.height,
              }}
            />
          </div>
        ) : null}
        {windowFocus ? null : focus}
      </div>
      {props.cursorPath?.authoredMotion && sceneLayout ? (
        <ReviewCursorMotionOverlay
          {...props.cursorPath}
          output={size}
          video={sceneLayout.videoTransform}
          projection={projection}
        />
      ) : null}
      {windowFocus ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={
            windowProjection
              ? { transformOrigin: '0 0', transform: quickEditProjectionCss(windowProjection) }
              : undefined
          }
        >
          {focus}
        </div>
      ) : null}
    </>
  );
}

/** Overlay comment stack using the shared scene geometry. */
function ReviewStageComments(props: {
  visualMode?: 'handles' | undefined;
  onPreviewPosition?: Parameters<typeof ReviewCommentOverlay>[0]['onPreviewPosition'];
  clip?: Parameters<typeof ReviewCommentOverlay>[0]['clip'];
  attachment: CanvasComment['attachment'];
  projection?:
    | import('../../features/video/composition/motion/spatial-geometry').QuickEditHomography
    | undefined;
  comments: ReviewStageCommentBinding | undefined;
  layout: ReturnType<typeof computeQuickEditSceneLayout> | null;
  output: { width: number; height: number };
  source: ReviewSource;
}) {
  if (!props.comments?.items.length) return null;
  return (
    <ReviewCommentOverlay
      visualMode={props.visualMode}
      onPreviewPosition={props.onPreviewPosition}
      clip={props.clip}
      projection={props.projection}
      layout={props.layout ?? undefined}
      comments={props.comments.items.filter((c) => c.attachment === props.attachment)}
      annotations={props.comments.annotations}
      output={props.output}
      source={props.source}
      background={props.comments.background}
      camera={props.comments.camera}
      time={props.comments.time}
      selectedId={props.comments.selectedId}
      busy={props.comments.busy}
      onSelect={props.comments.onSelect}
      onMove={props.comments.onMove}
    />
  );
}

function reviewBackgroundPlaneProps(props: ReviewStageProps) {
  return {
    background: props.scene?.background,
    sceneSize: props.scene
      ? computeQuickEditSceneSize({ ...props.scene, source: props.source })
      : props.source,
    imageUrl: props.backgroundImageUrl,
    currentTime: props.scene?.focus?.time ?? 0,
    playing: props.preview?.playing,
    getCurrentTime: () =>
      props.preview?.sourceToResult(props.video.current?.currentTime ?? 0) ??
      props.scene?.focus?.time ??
      0,
  };
}

const noStageGeometrySubscription = () => () => {};
const noStageGeometrySnapshot = () => null;
