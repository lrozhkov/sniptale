import type { CanvasCommentExport } from '../../features/video/review/comments';
import { isCanvasCommentVisibleAt } from '../../features/video/review/comments';
import type {
  QuickEditAdvancedState,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import {
  computeQuickEditSceneLayout,
  evaluateQuickEditCameraAtTime,
} from '../../features/video/review/advanced/scene';
import { quickEditMotionBlurCameras } from '../../features/video/review/advanced/motion-blur';
import {
  evaluateReviewClicks,
  type ReviewClickCue,
} from '../../features/video/review/click-animation';
import { drawReviewSceneFrame } from './scene-frame';
import { drawReviewSceneOverlays } from './render-scene-overlays';
import { reviewWindowRasterBacking } from './window-header';
import type { ReviewSpatialRenderer } from '../../features/video/composition/canvas/spatial-renderer';
import type { ReviewTransitionSample } from './cut-transition-frames';

/** Graphical frame input contains no encoder, media sink, transport or publication authority. */
export interface ReviewRenderScene {
  sourceSize: { width: number; height: number };
  baseCanvas?: { width: number; height: number };
  windowHeader?: QuickEditAdvancedState['windowHeader'];
  background: QuickEditAdvancedState['background'];
  comments: readonly CanvasCommentExport[];
  clickCues?: readonly ReviewClickCue[] | undefined;
  zoomRegions: readonly QuickEditZoomRegion[];
  sceneScale?: number;
  headerImage?: CanvasImageSource | null;
  image: ImageBitmap | null;
}

/** Paints one decorated scene while its window owner retains frame assets and encoder lifetime. */
export function paintReviewExportScene({
  scene,
  context,
  canvas,
  sample,
  resultTime,
  sourceTime,
  spatialRenderer,
  scratch,
  blurEnabled,
}: {
  scene: Readonly<ReviewRenderScene>;
  context: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  sample: Pick<ReviewTransitionSample, 'draw'>;
  resultTime: number;
  sourceTime: number;
  spatialRenderer: ReviewSpatialRenderer | undefined;
  scratch: HTMLCanvasElement | null;
  blurEnabled: boolean;
}) {
  const camera = evaluateQuickEditCameraAtTime(scene.zoomRegions, resultTime, {
    source: scene.sourceSize,
    canvas: scene.baseCanvas ?? canvas,
    background: scene.background,
    windowHeader: scene.windowHeader,
    output: canvas,
  });
  const layout = computeQuickEditSceneLayout({
    output: canvas,
    source: scene.sourceSize,
    canvas: scene.baseCanvas ?? canvas,
    windowHeader: scene.windowHeader,
    background: scene.background,
    camera,
  });
  const burned = scene.comments.filter(
    (comment) => comment.renderToVideo && isCanvasCommentVisibleAt(comment, sourceTime)
  );
  const magnify = evaluateReviewClicks(scene.clickCues ?? [], resultTime).some(
    (click) => (click.lens?.scale ?? 1) > 1
  );
  drawReviewSceneFrame(context, {
    spatialRenderer,
    canvas,
    layout,
    background: scene.background,
    image: scene.image,
    headerImage: scene.headerImage,
    sample: sample,
    deferComments: true,
    comments: burned,
    sourceTime: sourceTime,
    cameraScale: camera.scale,
    motionBlur: blurEnabled
      ? quickEditMotionBlurCameras(scene.zoomRegions, resultTime, {
          source: scene.sourceSize,
          canvas: scene.baseCanvas ?? canvas,
          background: scene.background,
          windowHeader: scene.windowHeader,
          output: canvas,
        })
      : undefined,
    sceneScale: scene.sceneScale ?? 1,
    windowRasterBacking: magnify
      ? reviewWindowRasterBacking({
          windowRect: layout.windowRect,
          sourceWidth: scene.sourceSize.width * (layout.sourceCrop?.width ?? 1),
          magnify,
        })
      : undefined,
    drawOverlays: (windowRaster) =>
      drawReviewSceneOverlays({
        scene: {
          canvas,
          layout,
          background: scene.background,
          image: scene.image,
          sample: sample,
          comments: burned,
          sourceTime: sourceTime,
          sceneScale: scene.sceneScale ?? 1,
        },
        renderer: spatialRenderer,
        context,
        canvas,
        spotlightScratch: scratch,
        regions: scene.zoomRegions,
        globalResultTime: resultTime,
        cameraScale: camera.scale,
        sourceWidth: scene.sourceSize.width,
        clicks: scene.clickCues,
        windowRaster,
      }),
  });
}
