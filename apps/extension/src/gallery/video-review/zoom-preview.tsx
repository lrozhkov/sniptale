import { evaluateReviewFollowCursor } from '../../features/video/review/advanced/cursor-focus-path';
import {
  quickEditPlaneProjection,
  quickEditProjectionCss,
} from '../../features/video/composition/motion/spatial-geometry';
import {
  DEFAULT_CAMERA_DEPTH as DEFAULT_QUICK_EDIT_DEPTH,
  DEFAULT_CAMERA_PERSPECTIVE as DEFAULT_QUICK_EDIT_PERSPECTIVE,
  interpolateCameraSpatial as interpolateQuickEditSpatial,
} from '../../features/video/project/motion/spatial';
import {
  ReviewSpatialToolbar,
  ReviewSpatialControls,
  ReviewSpatialToolContext,
} from './spatial-controls';
import type { SpatialTool, SpatialAxis } from './spatial-gesture';
import { quickEditSpatialTargetCamera } from '../../features/video/review/advanced/spatial';
import { resolveQuickEditFocusLink } from '../../features/video/review/advanced/focus-layout';
import { ReviewMotionBlurPreview } from './motion-blur-preview';
import { ReviewSpotlightOverlay } from './spotlight-overlay';
import { ReviewBorderOverlay } from './border-overlay';
import { evaluateQuickEditSpotlightsAtTime } from '../../features/video/review/advanced/focus';
import { evaluateQuickEditBordersAtTime } from '../../features/video/review/advanced/border';
import type { SceneSpotlightLayer } from '../../features/video/composition/draw/spotlight';
import { useReviewWindowHeader } from './use-window-header';
import { ZoomPreviewCanvas } from './zoom-preview-canvas';
import { ReviewSpotlightPreview } from './spotlight-preview';
import { useContext, useMemo, useRef, useState, type RefObject } from 'react';
import { useReviewBackgroundImage } from './use-review-background';
import { translate } from '../../platform/i18n';
import type {
  QuickEditBackgroundSettings,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import {
  computeQuickEditSceneCamera,
  resolveReviewCameraGeometry,
  resolveReviewSceneCameraPlan,
  resolveReviewCameraConflicts,
  computeQuickEditSpatialWindow,
  computeQuickEditSourceWindowTransform,
  computeQuickEditSceneLayout,
  quickEditCropCamera,
  computeQuickEditSceneSize,
} from '../../features/video/review/advanced/scene';
import {
  createQuickEditZoomRegion,
  type QuickEditZoomRegionPatch,
} from '../../features/video/review/advanced/zoom';
import { SegmentedRow } from '../../ui/compact-inspector-controls';
import { ReviewButton } from './controls';
import { previewBackgroundPaint } from './zoom-preview-paint';
import { useZoomPreviewFrame, type ZoomPreviewFrameLoader } from './use-zoom-preview-source';

/** Bounded canvas size; scene geometry scales padding into these output pixels. */
const PREVIEW_WIDTH_PX = 480;
/**
 * Selected-region framing preview: the real source frame at the region midpoint, the
 * scene layout the export applies (background padding plus fitted video), and the zoom
 * footprint through one interactive canvas.
 */
type ZoomPreviewProps = {
  region: QuickEditZoomRegion;
  cursorFollowing?: boolean;
  spatialEdit?: {
    region: QuickEditZoomRegion;
    revision: string;
    enabled?: boolean;
    onCommit(revision: string, patch: QuickEditZoomRegionPatch): void;
  };
  focus?: { regions: readonly QuickEditZoomRegion[]; time: number } | undefined;
  background: QuickEditBackgroundSettings;
  source: { width: number; height: number };
  canvas?: { width: number; height: number } | undefined;
  windowHeader?:
    | import('../../features/video/review/advanced/types').QuickEditWindowHeader
    | undefined;
  /** Result-time region midpoint mapped through cuts/speed; null while it has no frame. */
  sourceTime: number | null;
  loadFrame: ZoomPreviewFrameLoader | null;
  /** Read-only transport sample while playing; paused editing retains the selected target. */
  playback?: { video: HTMLVideoElement; camera: QuickEditZoomRegion['transform'] } | undefined;
  onInteract?: ((sourceTime: number) => void) | undefined;
  onChange(patch: QuickEditZoomRegionPatch): void;
  onPreview?: ((patch: QuickEditZoomRegionPatch | null) => void) | undefined;
  disabled?: boolean;
};

function resolvePreviewCameraAdmission(props: ZoomPreviewProps) {
  const region = props.region;
  const followRegion = props.focus?.regions.find(
    (item) => item.id === region.id || item.id.startsWith(`${region.id}:slice:`)
  );
  const followGeometry =
    followRegion &&
    resolveReviewCameraGeometry(props.focus?.regions ?? [followRegion], followRegion, {
      source: props.source,
      canvas: props.canvas,
      windowHeader: props.windowHeader,
      background: props.background,
    });
  const followPlan =
    followRegion && followGeometry
      ? resolveReviewSceneCameraPlan(props.focus?.regions ?? [followRegion], followRegion, {
          source: props.source,
          canvas: props.canvas,
          windowHeader: props.windowHeader,
          background: props.background,
        })
      : null;

  const topology = props.focus?.regions ?? [region];
  const outgoing = resolveQuickEditFocusLink(topology, followRegion?.id ?? region.id);
  const incoming = topology.find(
    (item) =>
      resolveQuickEditFocusLink(topology, item.id)?.target.id === (followRegion?.id ?? region.id)
  );
  const cameraConflicts = topology.some((item) => item.cursorFocus)
    ? resolveReviewCameraConflicts(
        topology,
        {
          source: props.source,
          canvas: props.canvas,
          windowHeader: props.windowHeader,
          background: props.background,
        },
        { start: incoming?.end ?? region.start, end: outgoing?.target.start ?? region.end }
      )
    : [];
  return { followPlan, cameraConflicts };
}

function PreviewCameraFollowStatus(props: {
  cameraConflicts: ReturnType<typeof resolvePreviewCameraAdmission>['cameraConflicts'];
  followPlan: ReturnType<typeof resolvePreviewCameraAdmission>['followPlan'];
  nominalScale: number;
}) {
  const { cameraConflicts, followPlan, nominalScale } = props;
  return cameraConflicts.length ? (
    <p role="status" className="text-xs text-[var(--sniptale-color-text-secondary)]">
      {translate('videoEditor.app.exportCameraConflict')}
    </p>
  ) : followPlan?.status === 'ready' && followPlan.targetScale < nominalScale ? (
    <p role="status" className="text-xs">
      {translate('videoEditor.sidebar.cameraExpansionApplied')}
    </p>
  ) : null;
}

export function ReviewZoomPreview(props: ZoomPreviewProps) {
  const { loadFrame, region, sourceTime } = props;
  const image = useReviewBackgroundImage(props.background);
  const header = useReviewWindowHeader(props.windowHeader, props.source.width, props.source.height);
  const controls = usePreviewToolSelection(props);
  const { tool, overlay, view } = controls;
  const bounds = useRef<HTMLDivElement>(null);
  const { frame, status, retry } = useZoomPreviewFrame(loadFrame, sourceTime);
  const playback = props.playback;
  const camera = resolvePreviewCamera(props);
  const { followPlan, cameraConflicts } = resolvePreviewCameraAdmission(props);
  const { output, layout, previewScale, cornerRadius } = useZoomPreviewGeometry(props, camera);
  const previewStatus = playback ? 'ready' : status;
  const interactive = !props.disabled && !playback && status === 'ready';
  const positionInteractive = interactive && !props.cursorFollowing;
  const spatialInteractive =
    interactive && props.spatialEdit?.enabled !== false && !props.spatialEdit?.region.dormant;
  const background = props.background;
  const resultOverlays =
    !overlay && (view === 'result' || playback)
      ? resolveZoomResultOverlays({
          region,
          focus: props.focus,
          background,
          output,
          layout,
          scale: previewScale * camera.scale,
          cornerRadius,
        })
      : null;
  const authoredCenter = (patch: { centerX: number; centerY: number; scale?: number }) => {
    const mapped = quickEditCropCamera({ ...camera, ...patch }, props, true);
    return { ...patch, centerX: mapped.centerX, centerY: mapped.centerY };
  };
  const surface = {
    background,
    headerImage: header.image,
    imageUrl: image.url,
    cornerRadius,
    camera,
    disabled: !positionInteractive || tool !== 'position',
    live: !!playback,
    frame: playback ? { image: playback.video, ...props.source } : frame,
    layout,
    output,
    onPreview: props.onPreview,
    lensFrames: resultOverlays?.spotlights.filter((frame) => frame.lens),
  };
  return (
    <section
      data-ui="gallery.videoReview.zoomPreview"
      data-view={view}
      data-status={previewStatus}
      data-playing={!!playback}
      aria-label={translate('gallery.videoReview.zoomPreview')}
      className="space-y-2"
    >
      <PreviewCameraFollowStatus
        cameraConflicts={cameraConflicts}
        followPlan={followPlan}
        nominalScale={region.transform.scale}
      />
      {overlay || !props.spatialEdit ? (
        <ZoomPreviewHeading region={region} controls={controls} />
      ) : null}
      {!overlay && props.spatialEdit ? (
        <ZoomPreviewTools
          controls={controls}
          edit={props.spatialEdit}
          interactive={spatialInteractive}
        />
      ) : null}
      <div
        ref={bounds}
        {...previewInteractionHandlers(
          positionInteractive && tool === 'position',
          sourceTime,
          props.onInteract
        )}
        className="relative overflow-hidden rounded-[var(--sniptale-radius-sm)]"
        style={{ background: overlay ? previewBackgroundPaint(background) : '#000000' }}
      >
        {overlay ? (
          <ReviewSpotlightPreview
            {...surface}
            key={region.id}
            region={region}
            focus={props.focus}
            view="area"
            scale={previewScale}
            onChange={props.onChange}
          />
        ) : (
          <ZoomPreviewCanvas
            {...surface}
            key={region.id}
            previewScale={previewScale}
            view={view}
            onCenter={(patch) => props.onChange(authoredCenter(patch))}
            onPreview={(patch) => props.onPreview?.(patch ? authoredCenter(patch) : null)}
          />
        )}
        {!overlay && (view === 'result' || playback) ? (
          <ReviewMotionBlurPreview
            scene={props}
            hasSpatialBase={view === 'result'}
            focus={props.focus}
            camera={camera}
            layout={layout}
            output={output}
            background={background}
            imageUrl={image.url}
            headerImage={header.image}
            sceneScale={previewScale}
            getFrame={() => playback?.video ?? frame?.image ?? null}
          />
        ) : null}
        {resultOverlays ? <ZoomResultOverlays value={resultOverlays} /> : null}
        {!overlay && props.spatialEdit && tool !== 'position' ? (
          <ZoomSpatialEditor
            edit={props.spatialEdit}
            region={region}
            camera={camera}
            layout={layout}
            background={background}
            output={output}
            sourceTime={sourceTime}
            controls={controls}
            bounds={bounds}
            enabled={spatialInteractive}
            onPreview={props.onPreview}
            onInteract={props.onInteract}
          />
        ) : null}
      </div>
      <ZoomPreviewFeedback
        status={previewStatus}
        imageFailed={image.failed || header.failed}
        onRetry={() => {
          image.retry();
          header.retry();
          retry();
        }}
      />
    </section>
  );
}

/** Compose tool navigation and reset admission without changing the canvas lifecycle. */
function ZoomPreviewTools({
  controls,
  edit,
  interactive,
}: {
  controls: ReturnType<typeof usePreviewToolSelection>;
  edit: NonNullable<ZoomPreviewProps['spatialEdit']>;
  interactive: boolean;
}) {
  return (
    <ReviewSpatialToolbar
      tool={controls.tool}
      axis={controls.axis}
      disabled={!interactive}
      onTool={controls.setTool}
      onAxis={controls.setAxis}
      onReset={() => resetPreviewTool(edit, controls.tool, interactive)}
      resetTarget={controls.resetTarget}
    >
      <ZoomPreviewContext controls={controls} edit={edit} disabled={!interactive} />
    </ReviewSpatialToolbar>
  );
}

/** Owns temporary tool/view choices without changing the authored target or transport. */
function usePreviewToolSelection(props: ZoomPreviewProps) {
  const [zoomView, setView] = useState<'area' | 'result'>('area');
  const [localTool, setLocalTool] = useState<SpatialTool>('position');
  const shared = useContext(ReviewSpatialToolContext);
  const selectedTool = shared?.tool ?? localTool;
  const setTool = shared?.onTool ?? setLocalTool;
  const [axis, setAxis] = useState<SpatialAxis>('both');
  const { region } = props;
  const overlay = !!(region.spotlight || region.border);
  const unavailable = !props.spatialEdit || overlay;
  const tool = unavailable ? 'position' : selectedTool;
  const view = overlay ? 'area' : tool === 'position' ? zoomView : 'result';
  return { tool, axis, overlay, view, setTool, setAxis, setView, resetTarget: shared?.resetTarget };
}

/** Binds the authored edit to its rendered plane and cancels capture when the scene changes. */
function ZoomSpatialEditor(props: {
  edit: NonNullable<ZoomPreviewProps['spatialEdit']>;
  region: QuickEditZoomRegion;
  camera: QuickEditZoomRegion['transform'];
  layout: ReturnType<typeof computeQuickEditSceneLayout>;
  background: QuickEditBackgroundSettings;
  output: { width: number; height: number };
  sourceTime: number | null;
  controls: ReturnType<typeof usePreviewToolSelection>;
  bounds: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  onPreview: ZoomPreviewProps['onPreview'];
  onInteract: ZoomPreviewProps['onInteract'];
}) {
  const { edit, region, camera, layout, background, output, sourceTime } = props;
  const geometry = resolveSpatialControlGeometry(region, camera, layout, background);
  const sceneKey = JSON.stringify([
    region.id,
    sourceTime,
    output,
    layout.windowRect,
    background.enabled,
    background.zoomBehavior,
  ]);
  return (
    <ReviewSpatialControls
      key={sceneKey}
      region={edit.region}
      renderedRegion={region}
      revision={edit.revision}
      tool={props.controls.tool}
      axis={props.controls.axis}
      geometry={geometry}
      output={output}
      bounds={props.bounds}
      enabled={props.enabled}
      onPreview={(patch) => props.onPreview?.(patch)}
      onCommit={edit.onCommit}
      onInteract={() => {
        if (sourceTime !== null) props.onInteract?.(sourceTime);
      }}
    />
  );
}

/** The controls project from the same decorated source plane as the renderer. */
function resolveSpatialControlGeometry(
  region: QuickEditZoomRegion,
  camera: QuickEditZoomRegion['transform'],
  layout: ReturnType<typeof computeQuickEditSceneLayout>,
  background: QuickEditBackgroundSettings
) {
  const spatial =
    camera.spatial ??
    interpolateQuickEditSpatial(
      null,
      {
        ...region,
        perspective: DEFAULT_QUICK_EDIT_PERSPECTIVE,
        depthOfField: DEFAULT_QUICK_EDIT_DEPTH,
      },
      1
    );
  return {
    plane: layout.windowRect,
    projection: quickEditPlaneProjection(
      layout.windowRect,
      computeQuickEditSpatialWindow(layout, background),
      spatial
    ),
    rotation: spatial.rotation,
    focus: region.depthOfField ?? DEFAULT_QUICK_EDIT_DEPTH,
  };
}

/** Reset touches only the selected tool's authored parameters. */
function resetPreviewTool(
  edit: ZoomPreviewProps['spatialEdit'],
  tool: SpatialTool,
  interactive: boolean
) {
  if (!edit || !interactive) return;
  const perspective = edit.region.perspective;
  if (tool === 'position') {
    const { transform } = createQuickEditZoomRegion({ id: edit.region.id, at: edit.region.start });
    edit.onCommit(edit.revision, transform);
  } else if (tool === 'tilt' && perspective)
    edit.onCommit(edit.revision, {
      perspective: {
        ...perspective,
        rotateX: 0,
        rotateY: 0,
        strength: DEFAULT_QUICK_EDIT_PERSPECTIVE.strength,
      },
    });
  else if (tool === 'rotation' && perspective)
    edit.onCommit(edit.revision, { perspective: { ...perspective, rotateZ: 0 } });
  else if (tool === 'focus' && edit.region.depthOfField)
    edit.onCommit(edit.revision, { depthOfField: { ...DEFAULT_QUICK_EDIT_DEPTH } });
}

/** One reserved row keeps the canvas stationary as the editing tool changes. */
function ZoomPreviewContext(props: {
  controls: ReturnType<typeof usePreviewToolSelection>;
  edit: NonNullable<ZoomPreviewProps['spatialEdit']>;
  disabled: boolean;
}) {
  const { controls, edit, disabled } = props;
  if (controls.tool === 'position')
    return (
      <div data-ui="gallery.videoReview.previewMode">
        <SegmentedRow<'area' | 'result'>
          ariaLabel={translate('gallery.videoReview.zoomPreview')}
          columns={2}
          value={controls.view}
          options={[
            { value: 'area', label: translate('gallery.videoReview.zoomPreviewArea'), disabled },
            {
              value: 'result',
              label: translate('gallery.videoReview.zoomPreviewResult'),
              disabled,
            },
          ]}
          onChange={controls.setView}
        />
      </div>
    );
  if (controls.tool !== 'focus') return null;
  const depth = edit.region.depthOfField ?? DEFAULT_QUICK_EDIT_DEPTH;
  return (
    <SegmentedRow<'off' | 'area' | 'depth'>
      ariaLabel={translate('gallery.videoReview.depthMode')}
      value={depth.enabled ? depth.mode : 'off'}
      options={[
        { value: 'off', label: translate('gallery.videoReview.depthModeOff'), disabled },
        { value: 'area', label: translate('gallery.videoReview.depthModeArea'), disabled },
        { value: 'depth', label: translate('gallery.videoReview.depthModeDepth'), disabled },
      ]}
      onChange={(mode) =>
        edit.onCommit(edit.revision, {
          depthOfField: {
            ...depth,
            enabled: mode !== 'off',
            mode: mode === 'off' ? depth.mode : mode,
          },
        })
      }
    />
  );
}

/** Framing mode remains available only for ordinary Zoom positioning. */
function ZoomPreviewHeading(props: {
  region: QuickEditZoomRegion;
  controls: ReturnType<typeof usePreviewToolSelection>;
}) {
  const { region, controls } = props;
  return (
    <div className="min-w-0 sniptale-parameter-stack">
      <h5 className="px-2 text-xs font-semibold text-[var(--sniptale-color-text-secondary)]">
        {translate(
          region.border
            ? 'gallery.videoReview.borderPreview'
            : controls.overlay
              ? 'gallery.videoReview.focusPreview'
              : 'gallery.videoReview.zoomPreview'
        )}
      </h5>
      {!controls.overlay && controls.tool === 'position' && (
        <SegmentedRow<'area' | 'result'>
          columns={2}
          ariaLabel={translate('gallery.videoReview.zoomPreview')}
          value={controls.view}
          options={[
            { value: 'area', label: translate('gallery.videoReview.zoomPreviewArea') },
            { value: 'result', label: translate('gallery.videoReview.zoomPreviewResult') },
          ]}
          onChange={controls.setView}
        />
      )}
    </div>
  );
}

/** Overlay framing stays unzoomed; Zoom follows the sampled playback camera. */
function resolvePreviewCamera(props: ZoomPreviewProps) {
  if (props.region.spotlight || props.region.border)
    return { scale: 1, centerX: 0.5, centerY: 0.5 };
  if (props.playback) return props.playback.camera;
  const target = quickEditCropCamera(quickEditSpatialTargetCamera(props.region), props);
  const time = props.focus?.time ?? (props.region.start + props.region.end) / 2;
  const effective = props.focus?.regions.find(
    (region) =>
      (region.id === props.region.id || region.id.startsWith(`${props.region.id}:slice:`)) &&
      time >= region.start &&
      time < region.end
  );
  return effective
    ? evaluateReviewFollowCursor(
        effective,
        time,
        target,
        resolveReviewCameraGeometry(props.focus?.regions ?? [effective], effective, {
          source: props.source,
          canvas: props.canvas,
          windowHeader: props.windowHeader,
          background: props.background,
        }),
        resolveReviewSceneCameraPlan(props.focus?.regions ?? [effective], effective, {
          source: props.source,
          canvas: props.canvas,
          windowHeader: props.windowHeader,
          background: props.background,
        }) ?? undefined
      )
    : target;
}

/** Results composite all sampled masks before source-attached strokes in the same window. */
function resolveZoomResultOverlays(props: {
  region: QuickEditZoomRegion;
  focus: ZoomPreviewProps['focus'];
  background: QuickEditBackgroundSettings;
  output: { width: number; height: number };
  layout: ReturnType<typeof computeQuickEditSceneLayout>;
  scale: number;
  cornerRadius: number;
}): {
  output: { width: number; height: number };
  spotlights: SceneSpotlightLayer[];
  borders: ReturnType<typeof evaluateQuickEditBordersAtTime>;
  clip: { rect: { x: number; y: number; width: number; height: number }; radius: number };
  projection: ReturnType<typeof quickEditPlaneProjection> | undefined;
} {
  const sample = {
    regions: props.focus?.regions ?? [props.region],
    time: props.focus?.time ?? (props.region.start + props.region.end) / 2,
    output: props.output,
    video: computeQuickEditSourceWindowTransform(props.layout),
    scale: props.scale,
  };
  const motion = computeQuickEditSceneCamera(props.layout, props.background);
  const clip = {
    rect: motion.windowClip,
    radius: props.cornerRadius * (motion.windowClip.width / props.layout.windowRect.width),
  };
  const window = computeQuickEditSpatialWindow(props.layout, props.background);
  const projection = props.layout.spatial
    ? quickEditPlaneProjection(window, window, props.layout.spatial)
    : undefined;
  return {
    output: props.output,
    spotlights: evaluateQuickEditSpotlightsAtTime(sample).map((frame) => ({
      ...frame,
      clip,
      ...(projection ? { projection } : {}),
    })),
    borders: evaluateQuickEditBordersAtTime(sample),
    clip,
    projection,
  };
}

function ZoomResultOverlays(props: { value: ReturnType<typeof resolveZoomResultOverlays> }) {
  const { spotlights, borders, clip, projection, output } = props.value;
  return (
    <>
      <ReviewSpotlightOverlay
        projection={projection}
        output={output}
        frames={spotlights.filter((frame) => frame.dim > 0 || frame.blur > 0)}
        clip={clip}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={
          projection
            ? { transformOrigin: '0 0', transform: quickEditProjectionCss(projection) }
            : undefined
        }
      >
        <ReviewBorderOverlay output={output} frames={borders} clip={clip} />
      </div>
    </>
  );
}

/** Only active framing gestures synchronize transport; loading, Tab and cancel do not seek. */
function previewInteractionHandlers(
  ready: boolean,
  time: number | null,
  onInteract: ((time: number) => void) | undefined
) {
  const seek = () => {
    if (ready && time !== null) onInteract?.(time);
  };
  return {
    onPointerDownCapture: (event: React.PointerEvent) => {
      if (event.button === 0) seek();
    },
    onKeyDownCapture: (event: React.KeyboardEvent) => {
      if (event.key.startsWith('Arrow')) seek();
    },
  };
}

/** Frame and background loading feedback stays independent of camera geometry and gestures. */
function ZoomPreviewFeedback(props: {
  status: ReturnType<typeof useZoomPreviewFrame>['status'];
  imageFailed: boolean;
  onRetry(): void;
}) {
  return (
    <>
      {props.status === 'unavailable' || props.status === 'loading' ? (
        <p role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate(
            props.status === 'unavailable'
              ? 'gallery.videoReview.zoomPreviewUnavailable'
              : 'gallery.videoReview.zoomPreviewLoading'
          )}
        </p>
      ) : null}
      {props.status === 'failed' || props.imageFailed ? (
        <p
          role="alert"
          className="flex items-center gap-2 text-xs text-[var(--sniptale-color-danger)]"
        >
          <span>{translate('gallery.videoReview.zoomPreviewFailed')}</span>
          <ReviewButton
            label={translate('gallery.videoReview.retry')}
            className="!h-6 !min-h-6 !px-1.5 text-xs"
            onClick={props.onRetry}
          />
        </p>
      ) : null}
    </>
  );
}

/** Memoizes the inspector viewport and source/window projection as one consistent scene. */
function useZoomPreviewGeometry(
  { source, canvas, background, windowHeader }: Parameters<typeof computeQuickEditSceneSize>[0],
  camera: QuickEditZoomRegion['transform']
) {
  return useMemo(() => {
    const size = computeQuickEditSceneSize({ source, canvas, background, windowHeader });
    const width = Math.max(1, Math.min(PREVIEW_WIDTH_PX, Math.round(size.width) || 1));
    const height = Math.max(1, Math.round((width * (size.height || 1)) / Math.max(1, size.width)));
    const output = { width, height };
    const previewScale = width / Math.max(1, canvas?.width ?? source.width);
    return {
      output,
      previewScale,
      cornerRadius: background.enabled ? background.layout.cornerRadius * previewScale : 0,
      layout: computeQuickEditSceneLayout({
        source,
        canvas,
        background,
        windowHeader,
        output,
        camera,
      }),
    };
  }, [source, canvas, background, windowHeader, camera]);
}
