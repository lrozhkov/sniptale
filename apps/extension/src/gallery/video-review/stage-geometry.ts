import { uncropMediaSourceRect } from '../../features/video/project/media-crop';
import { createReviewAnnotationGeometry } from './annotation-effects-geometry';
import { useEffect, useState, type RefObject } from 'react';
import { serializePaintToCss } from '@sniptale/foundation/paint';
import { VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';
import { resolveVideoExportDimensions } from '../../features/video/project/export/output-dimensions';
import { fitVideoRect } from '../../features/video/review/geometry';
import type { ReviewRegion, ReviewSource } from '../../features/video/review/types';
import { quickEditPlaneProjection } from '../../features/video/review/advanced/spatial-geometry';
import { evaluateQuickEditBordersAtTime } from '../../features/video/review/advanced/border';
import { evaluateQuickEditSpotlightsAtTime } from '../../features/video/review/advanced/focus';
import {
  computeQuickEditSceneLayout,
  quickEditCropCamera,
  computeQuickEditSpatialWindow,
  computeQuickEditSpatialRasterLayout,
  computeQuickEditSceneSize,
  computeQuickEditWindowTransform,
  computeQuickEditSourceWindowTransform,
  computeQuickEditSceneCamera,
  computeQuickEditVideoTransform,
} from '../../features/video/review/advanced/scene';
import type {
  QuickEditBackgroundSettings,
  QuickEditCameraTransform,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';

export type ReviewStageScene = {
  background: QuickEditBackgroundSettings;
  canvas?: { width: number; height: number } | undefined;
  windowHeader?:
    | import('../../features/video/review/advanced/types').QuickEditWindowHeader
    | undefined;
  camera: QuickEditCameraTransform;
  focus?: { regions: readonly QuickEditZoomRegion[]; time: number };
};

export type ReviewStageCommentGeometry = {
  output: { width: number; height: number };
  projection?:
    | import('../../features/video/review/advanced/spatial-geometry').QuickEditHomography
    | undefined;
  videoTransform: { x: number; y: number; width: number; height: number } | null;
};

type ReviewStageGeometryInput = {
  source: ReviewSource;
  scene?: ReviewStageScene;
  zoom?: { region: QuickEditZoomRegion };
  comments?: { onGeometry?(geometry: ReviewStageCommentGeometry): void };
};

/** Stage pixels: the host box measured once and on every resize. */
function useStageMeasure(host: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 1, height: 1 });
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const measure = () =>
      setSize({ width: Math.max(1, node.clientWidth), height: Math.max(1, node.clientHeight) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [host]);
  return size;
}

function backgroundPaintOf(background: {
  type: 'solid' | 'gradient' | 'image';
  color?: string;
  gradient?: import('@sniptale/foundation/paint').Gradient;
}): string {
  if (background.type === 'solid' && background.color) return background.color;
  if (background.type === 'gradient' && background.gradient)
    return serializePaintToCss({ kind: 'gradient', gradient: background.gradient });
  return '#000000';
}

/** Align the stationary raster bounds; fractional video boxes expose the black stage edge. */
function snapPreviewRect(rect: ReviewRegion): ReviewRegion {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

function previewSceneLayout(input: Parameters<typeof computeQuickEditSceneLayout>[0]) {
  const layout = computeQuickEditSceneLayout(input);
  if (layout.sourceCrop && layout.visibleVideoRect) {
    const visibleVideoRect = snapPreviewRect(layout.visibleVideoRect);
    const crop = layout.sourceCrop;
    const videoRect = uncropMediaSourceRect(visibleVideoRect, crop);
    const windowRect = {
      ...visibleVideoRect,
      y: Math.round(layout.windowRect.y),
      height: visibleVideoRect.y + visibleVideoRect.height - Math.round(layout.windowRect.y),
    };
    return {
      ...layout,
      videoRect,
      visibleVideoRect,
      windowRect,
      videoTransform: computeQuickEditVideoTransform({
        videoRect,
        windowRect,
        camera: input.camera,
      }),
    };
  }
  const videoRect = snapPreviewRect(layout.videoRect);
  const windowRect = {
    ...videoRect,
    y: Math.round(layout.windowRect.y),
    height: videoRect.height + videoRect.y - Math.round(layout.windowRect.y),
  };
  // Camera motion stays subpixel-smooth and overlays use the same displayed frame bounds.
  return {
    ...layout,
    videoRect,
    windowRect,
    videoTransform: computeQuickEditVideoTransform({ videoRect, windowRect, camera: input.camera }),
  };
}

/** Pure scene geometry keeps CSS fitting separate from canonical output pixels. */
function resolveStageGeometry(
  props: ReviewStageGeometryInput,
  viewport: { width: number; height: number }
) {
  const sceneSize = props.scene
    ? computeQuickEditSceneSize({ ...props.scene, source: props.source })
    : props.source;
  const fitted = fitVideoRect(viewport, sceneSize);
  const size = snapPreviewRect(fitted);
  const sceneLayout = props.scene
    ? previewSceneLayout({
        output: fitted,
        canvas: props.scene?.canvas,
        windowHeader: props.scene?.windowHeader,
        source: props.source,
        background: props.scene.background,
        camera: props.scene.camera,
      })
    : null;
  const zoomLayout = props.zoom
    ? previewSceneLayout({
        output: fitted,
        canvas: props.scene?.canvas,
        windowHeader: props.scene?.windowHeader,
        source: props.source,
        background: props.scene?.background ?? { enabled: false },
        camera:
          props.zoom.region.spotlight || props.zoom.region.border
            ? (props.scene?.camera ?? { scale: 1, centerX: 0.5, centerY: 0.5 })
            : quickEditCropCamera(
                props.zoom.region.transform,
                props.scene ? { ...props.scene, source: props.source } : undefined
              ),
      })
    : null;
  const backgroundPaint = props.scene?.background.enabled
    ? backgroundPaintOf(props.scene.background)
    : null;
  // Drawing maps into the represented pixels, so the post-camera rect is authoritative.
  const content = sceneLayout ? sceneLayout.videoTransform : fitVideoRect(size, props.source);
  const decorations = resolveStageDecorations(props, size, sceneLayout);
  const watermarkOutput = resolveVideoExportDimensions(
    sceneSize.width,
    sceneSize.height,
    VideoResolutionPreset.SOURCE
  );
  return {
    size,
    watermarkOutput,
    annotationGeometry: createReviewAnnotationGeometry({
      source: props.source,
      output: watermarkOutput,
      background: props.scene?.background ?? { enabled: false },
      canvas: props.scene?.canvas,
      windowHeader: props.scene?.windowHeader,
      camera: props.scene?.camera ?? { scale: 1, centerX: 0.5, centerY: 0.5 },
    }),
    sceneLayout,
    zoomLayout,
    backgroundPaint,
    content,
    ...decorations,
  };
}

/** Focus decorations share one represented frame, scale, and clipping plane. */
function resolveStageDecorations(
  props: ReviewStageGeometryInput,
  size: { width: number; height: number },
  sceneLayout: ReturnType<typeof previewSceneLayout> | null
) {
  const scene = props.scene;
  if (!sceneLayout || !scene) return { spotlight: [], borders: [], overlayClip: undefined };
  const scale = size.width / Math.max(1, scene.canvas?.width ?? props.source.width);
  const focus = scene.focus
    ? {
        ...scene.focus,
        output: size,
        video: computeQuickEditSourceWindowTransform(sceneLayout),
        scale: scale * scene.camera.scale,
      }
    : null;
  const clip = computeQuickEditSceneCamera(sceneLayout, scene.background).windowClip;
  const overlayClip = {
    rect: clip,
    radius: scene.background.enabled
      ? ((scene.background.layout.cornerRadius * size.width) /
          Math.max(1, scene.canvas?.width ?? props.source.width)) *
        (clip.width / sceneLayout.windowRect.width)
      : 0,
  };
  return {
    spotlight: focus ? evaluateQuickEditSpotlightsAtTime(focus) : [],
    borders: focus ? evaluateQuickEditBordersAtTime(focus) : [],
    overlayClip,
  };
}

/** Rasterize before outer zoom: tilt can bring off-viewport click pixels back into view. */
export function resolveReviewClickRaster(
  layout: ReturnType<typeof previewSceneLayout>,
  background: QuickEditBackgroundSettings,
  clip: { rect: ReviewRegion; radius: number }
) {
  if (!layout.spatial)
    return {
      video: layout.videoTransform,
      clip,
      transform: undefined,
      window: {
        videoRect: layout.videoRect,
        visibleVideoRect: layout.visibleVideoRect,
        sourceCrop: layout.sourceCrop,
        windowRect: layout.windowRect,
        transform: computeQuickEditWindowTransform(layout),
      },
    };
  const raster = computeQuickEditSpatialRasterLayout(layout, background);
  const base = layout.windowRect;
  const scale = clip.rect.width / base.width;
  return {
    video: raster.videoTransform,
    clip: { rect: base, radius: clip.radius / scale },
    transform: { scale, x: clip.rect.x - scale * base.x, y: clip.rect.y - scale * base.y },
    window: {
      videoRect: raster.videoRect,
      visibleVideoRect: raster.visibleVideoRect,
      sourceCrop: raster.sourceCrop,
      windowRect: raster.windowRect,
      transform: computeQuickEditWindowTransform(raster),
    },
  };
}

/** Measures and reports the preview through the same scene model as export. */
export function useReviewStageGeometry(
  props: ReviewStageGeometryInput,
  host: RefObject<HTMLDivElement | null>
) {
  const viewport = useStageMeasure(host);
  const geometry = resolveStageGeometry(props, viewport);
  const { size, sceneLayout } = geometry;
  const reportGeometry = props.comments?.onGeometry;
  useEffect(() => {
    if (reportGeometry && sceneLayout)
      reportGeometry({
        output: size,
        projection: sceneLayout.spatial
          ? quickEditPlaneProjection(
              computeQuickEditSpatialWindow(
                sceneLayout,
                props.scene?.background ?? { enabled: false }
              ),
              computeQuickEditSpatialWindow(
                sceneLayout,
                props.scene?.background ?? { enabled: false }
              ),
              sceneLayout.spatial
            )
          : undefined,
        videoTransform: sceneLayout.videoTransform,
      });
  }, [size, sceneLayout, reportGeometry, props.scene?.background]);
  return geometry;
}
