import { GPU_PREVIEW_UNIFORM_BYTES } from '../../features/video/composition/canvas/gpu-preview';
import {
  invertQuickEditProjection,
  multiplyQuickEditProjections,
  quickEditPlaneProjection,
  type QuickEditHomography,
} from '../../features/video/composition/motion/spatial-geometry';
import {
  computeQuickEditSceneCamera,
  computeQuickEditSceneLayout,
  computeQuickEditSpatialWindow,
  computeQuickEditSpatialRasterLayout,
  computeQuickEditWindowTransform,
  evaluateQuickEditCameraAtTime,
} from '../../features/video/review/advanced/scene';
import type { QuickEditCameraTransform } from '../../features/video/review/advanced/types';
import type { PreviewScene, PreviewSceneDimensions } from './preview-scene';
import { reviewSpatialSourceRect } from './scene-shadow';
const identity: QuickEditHomography = [1, 0, 0, 0, 1, 0, 0, 0, 1];
type Dimensions = PreviewSceneDimensions;

/** Preserve the legacy raster-local zoom before the decorated window receives its 3D transform. */
export function reviewGpuSourcePlane(
  layout: ReturnType<typeof computeQuickEditSceneLayout>,
  background: PreviewScene['background']
) {
  const raster = layout.spatial ? computeQuickEditSpatialRasterLayout(layout, background) : layout;
  const window = computeQuickEditWindowTransform(raster);
  const base = layout.windowRect;
  const scale = window.width / base.width;
  const innerProjection: QuickEditHomography = [
    scale,
    0,
    window.x - base.x * scale,
    0,
    scale,
    window.y - base.y * scale,
    0,
    0,
    1,
  ];
  const outerProjection: QuickEditHomography = layout.spatial
    ? quickEditPlaneProjection(
        base,
        computeQuickEditSpatialWindow(layout, background),
        layout.spatial
      )
    : identity;
  const outerInverse = invertQuickEditProjection(outerProjection);
  if (!outerInverse) throw new Error('Preview window projection is unavailable.');
  const motion = computeQuickEditSceneCamera(
    raster,
    layout.spatial ? { ...background, zoomBehavior: 'fixed' as const } : background
  );
  return {
    video: raster.videoTransform,
    header: {
      x: window.x,
      y: window.y,
      width: window.width,
      height: ((layout.visibleVideoRect ?? layout.videoRect).y - base.y) * scale,
    },
    clip: motion.windowClip,
    sourceClip: {
      x: (motion.windowClip.x - innerProjection[2]!) / scale,
      y: (motion.windowClip.y - innerProjection[5]!) / scale,
      width: motion.windowClip.width / scale,
      height: motion.windowClip.height / scale,
    },
    innerScale: scale,
    clipScale: motion.scale,
    shadowRect(rect: typeof base) {
      const shadowScale = motion.windowClip.width / base.width;
      return {
        x: motion.windowClip.x + (rect.x - base.x) * shadowScale,
        y: motion.windowClip.y + (rect.y - base.y) * shadowScale,
        width: rect.width * shadowScale,
        height: rect.height * shadowScale,
      };
    },
    innerProjection,
    outerProjection,
    outerInverse,
  };
}

/** Immutable geometry of a completed frame, in canonical composition pixels. */
export interface ReviewPresentedGeometry {
  /** Assigned by the publication owner; pure geometry plans have no publication identity. */
  generation?: number;
  sceneGeneration?: number;
  camera: QuickEditCameraTransform;
  scene: Pick<PreviewScene, 'background' | 'canvas' | 'windowHeader' | 'zoomRegions'>;
  layout: ReturnType<typeof computeQuickEditSceneLayout>;
  /** Source-plane zoom precedes the outer window projection. */
  projection: QuickEditHomography;
  inverse: QuickEditHomography;
  windowProjection: QuickEditHomography;
  windowInverse: QuickEditHomography;
  resultTime: number;
  logical: { width: number; height: number };
}

/** Shared canonical camera evaluation; CSS adapters scale this receipt without a second camera. */
export function reviewPresentedGeometry(
  scene: PreviewScene,
  dimensions: Dimensions,
  resultTime: number,
  override?: QuickEditCameraTransform
): ReviewPresentedGeometry {
  const input = { ...scene, output: dimensions.canonical };
  const camera = override ?? evaluateQuickEditCameraAtTime(scene.zoomRegions, resultTime, input);
  const layout = computeQuickEditSceneLayout({ ...input, camera });
  const plane = reviewGpuSourcePlane(layout, scene.background);
  const projection = multiplyQuickEditProjections(plane.outerProjection, plane.innerProjection);
  const inverse = invertQuickEditProjection(projection);
  if (!inverse) throw new Error('Preview projection is unavailable.');
  return {
    camera,
    scene,
    layout,
    projection,
    inverse,
    windowProjection: plane.outerProjection,
    windowInverse: plane.outerInverse,
    resultTime,
    logical: dimensions.canonical,
  };
}

/** Adapt the exact presented projection to the stage's already zoomed CSS video plane. */
export function reviewPresentedStageProjection(
  geometry: ReviewPresentedGeometry,
  output: { width: number; height: number },
  plane: 'source' | 'window' = 'source'
): QuickEditHomography {
  const x = output.width / geometry.logical.width;
  const y = output.height / geometry.logical.height;
  if (plane === 'window')
    return multiplyQuickEditProjections(
      [x, 0, 0, 0, y, 0, 0, 0, 1],
      multiplyQuickEditProjections(geometry.windowProjection, [1 / x, 0, 0, 0, 1 / y, 0, 0, 0, 1])
    );
  const base = geometry.layout.videoRect;
  const displayed = geometry.layout.videoTransform;
  const unzoom: QuickEditHomography = [
    base.width / (displayed.width * x),
    0,
    base.x - (displayed.x * base.width) / displayed.width,
    0,
    base.height / (displayed.height * y),
    base.y - (displayed.y * base.height) / displayed.height,
    0,
    0,
    1,
  ];
  return multiplyQuickEditProjections(
    [x, 0, 0, 0, y, 0, 0, 0, 1],
    multiplyQuickEditProjections(geometry.projection, unzoom)
  );
}

/** Conservative explicit raster/texture estimate, admitted before the GPU owner allocates. */
export function reviewGpuPreviewAllocation(
  scene: PreviewScene,
  dimensions: Dimensions,
  maximumInFlight: 1 | 2 = 1
) {
  const base = computeQuickEditSceneLayout({
    ...scene,
    output: dimensions.canonical,
    camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
  });
  const scale = dimensions.canonical.width / (scene.canvas?.width ?? scene.source.width);
  const background = scene.background.enabled
    ? {
        ...scene.background,
        layout: {
          ...scene.background.layout,
          cornerRadius: scene.background.layout.cornerRadius * scale,
        },
      }
    : scene.background;
  const decor = reviewSpatialSourceRect({
    output: dimensions.canonical,
    window: base.windowRect,
    background,
    sceneScale: scale,
  });
  const outputBytes = dimensions.backing.width * dimensions.backing.height * 4;
  const hasAnnotations =
    scene.annotationEffects?.lane.enabled &&
    scene.annotationEffects.lane.instances.some((instance) => instance.enabled);
  // Annotated dissolve endpoints retain two GPU outputs and two primitive coverage masks.
  const annotationBytes = hasAnnotations
    ? outputBytes * 2 + dimensions.canonical.width * dimensions.canonical.height * 4 * 2
    : 0;
  const retainedRasterBytes = decor.width * decor.height * 4 + outputBytes * 2;
  return {
    maximumManagedBytes:
      maximumInFlight *
      (retainedRasterBytes * 2 +
        annotationBytes +
        256 * 1024 * 1024 +
        dimensions.canonical.width * dimensions.canonical.height * 4 * 24 +
        GPU_PREVIEW_UNIFORM_BYTES * 512),
    maximumCanvases: maximumInFlight * (48 + (hasAnnotations ? 2 : 0)),
  };
}
