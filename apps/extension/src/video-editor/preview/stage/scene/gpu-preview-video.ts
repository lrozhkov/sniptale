import type { GpuPreviewLayer } from '../../../../features/video/composition/canvas/gpu-preview';
import type { VideoCompositionVisualLayer } from '../../../../features/video/composition/types';
import {
  isVideoCompositionFrameSource,
  type VideoCompositionMediaSource,
} from '../../../../features/video/composition/draw/media-source';

import { drawCompositionVisualLayer } from '../../../../features/video/composition/draw';

import {
  invertQuickEditProjection,
  multiplyQuickEditProjections,
  projectQuickEditPoint,
  type QuickEditHomography,
} from '../../../../features/video/composition/motion/spatial-geometry';
import { type SceneSpotlightLayer } from '../../../../features/video/composition/draw/spotlight';
import { sampleCompositionSpotlightLayer } from '../../../../features/video/composition/draw/project-spotlight';

import {
  getFittedMediaContentFrame,
  getFittedMediaOriginalWindowFrame,
  getFittedMediaWindowFrame,
  drawFittedMediaLayer,
} from '../../../../features/video/composition/draw/fitted-media';
import { resolveVideoWindowMedia } from '../../../../features/video/composition/draw/video';
import { drawPointerFeedbackLensShadow } from '../../../../features/video/composition/draw/pointer-feedback';
import {
  DEFAULT_CAMERA_APPEARANCE,
  cameraWindowFrame,
} from '../../../../features/video/project/camera/appearance';
import { traceCameraShape } from '../../../../features/video/composition/draw/media-shadow';
import {
  roundedWindowRadius,
  resolveDecoratedMediaFrame,
} from '../../../../features/video/project/window-geometry';
import { VideoMediaFitMode } from '../../../../features/video/project/types';

type Layer = VideoCompositionVisualLayer;
type VideoLayer = Extract<Layer, { kind: 'video' }>;
const IDENTITY: QuickEditHomography = [1, 0, 0, 0, 1, 0, 0, 0, 1];
type Raster = (
  paint: (context: CanvasRenderingContext2D) => void,
  padded?: boolean,
  bounds?: GpuPreviewLayer['rect']
) => GpuPreviewLayer;
type WindowMedia = ReturnType<typeof resolveVideoWindowMedia> & { frame: VideoLayer };

/** Retain the header's own source alpha, with one logical boundary shared by the video. */
export function nativeGpuWindowHeader(media: WindowMedia, raster: Raster, inverse = IDENTITY) {
  const image = media.windowHeaderImage;
  if (!image) return null;
  const plane = resolveDecoratedMediaFrame({
    ...media,
    contentWidth: media.sourceWidth * (media.sourceCrop?.width ?? 1),
    contentHeight: media.sourceHeight * (media.sourceCrop?.height ?? 1),
    fit:
      media.fitMode === VideoMediaFitMode.CONTAIN
        ? 'contain'
        : media.fitMode === VideoMediaFitMode.COVER
          ? 'cover'
          : 'stretch',
  });
  const source = { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  const pixels = raster(
    (context) => context.drawImage(image, 0, 0, source.width, source.height),
    false,
    source
  );
  return {
    ...pixels,
    rect: { x: plane.x, y: plane.y, width: plane.width, height: plane.headerHeight },
    inverse,
    clampSourceEdges: ['bottom'],
  } satisfies GpuPreviewLayer;
}

/** Decorations retain canonical shadow geometry without rasterizing an internal header edge. */
export function paintNativeGpuDecoration(context: CanvasRenderingContext2D, media: WindowMedia) {
  drawFittedMediaLayer({ ...media, context, hideWindowHeader: true, render() {} });
}

/** Builds one video material; the caller owns raster allocation and ordered scene composition. */
export function buildNativeGpuVideoLayers(args: {
  layer: VideoLayer;
  source: VideoFrame;
  borrowed: VideoCompositionMediaSource | undefined;
  media: ReadonlyMap<string, VideoCompositionMediaSource>;
  imageBank: Record<string, HTMLImageElement>;
  inverse: QuickEditHomography;
  raster: Raster;
  groupLayer: (layers: readonly GpuPreviewLayer[], padded?: boolean) => GpuPreviewLayer;
  spotlight: (
    layers: readonly GpuPreviewLayer[],
    frames: readonly SceneSpotlightLayer[]
  ) => GpuPreviewLayer[];
}): GpuPreviewLayer[] {
  const { layer, source, inverse, raster, groupLayer, spotlight } = args;
  const borrowed = args.borrowed;
  const orientation = isVideoCompositionFrameSource(borrowed) ? borrowed.orientation : undefined;
  const appearance =
    layer.trackRole === 'CAMERA'
      ? (layer.clip.cameraAppearance ?? DEFAULT_CAMERA_APPEARANCE)
      : undefined;
  const dimensions = {
    sourceWidth: isVideoCompositionFrameSource(borrowed)
      ? borrowed.sourceWidth
      : source.displayWidth,
    sourceHeight: isVideoCompositionFrameSource(borrowed)
      ? borrowed.sourceHeight
      : source.displayHeight,
  };
  const media = {
    ...resolveVideoWindowMedia(layer, dimensions, 1, args.imageBank),
    frame: layer,
    ...(appearance ? { cameraAppearance: appearance } : {}),
  };
  const window = appearance
    ? cameraWindowFrame(layer, appearance.shape)
    : getFittedMediaWindowFrame(media);
  const content = getFittedMediaContentFrame(media);
  const bare: VideoLayer = {
    ...layer,
    rotation: 0,
    opacity: 1,
    renderState: {
      blurAmount: 0,
      opacityMultiplier: 1,
      scaleX: 1,
      scaleY: 1,
      translateX: 0,
      translateY: 0,
    },
    actions: [],
    borders: [],
    spotlights: [],
  };
  const mirror: QuickEditHomography =
    layer.trackRole === 'CAMERA' && layer.clip.cameraMirrored
      ? [-1, 0, layer.x * 2 + layer.width, 0, 1, 0, 0, 0, 1]
      : IDENTITY;
  const sourceInverse = invertQuickEditProjection(
    multiplyQuickEditProjections(layer.sourceContentTransform ?? IDENTITY, mirror)
  );
  if (!sourceInverse) throw new Error('Source projection is unavailable.');
  const sourceLayers: GpuPreviewLayer[] = [
    { source, rect: content, inverse: sourceInverse, ...(orientation ? { orientation } : {}) },
  ];
  const header =
    layer.effectActionsOnly &&
    !layer.actions?.some((action) => action.gestureFeedback?.effect === 'magnify')
      ? null
      : nativeGpuWindowHeader(media, raster, sourceInverse);
  const traceWindow = (context: CanvasRenderingContext2D) => {
    context.fillStyle = '#fff';
    if (appearance) traceCameraShape(context, window, appearance);
    else {
      context.beginPath();
      context.roundRect(
        window.x,
        window.y,
        window.width,
        window.height,
        roundedWindowRadius(window.width, window.height, layer.clip.windowCornerRadius ?? 0)
      );
    }
    context.fill();
  };
  const mask = raster((context) => {
    traceWindow(context);
    if (layer.clip.sourceCrop && !header) {
      const crop = layer.clip.sourceCrop;
      context.globalCompositeOperation = 'destination-in';
      context.fillRect(
        content.x + content.width * crop.x,
        content.y + content.height * crop.y,
        content.width * crop.width,
        content.height * crop.height
      );
    }
  }, true);
  if (header && layer.clip.sourceCrop) {
    const crop = layer.clip.sourceCrop;
    sourceLayers[0] = {
      ...sourceLayers[0]!,
      clip: {
        rect: {
          x: content.x + content.width * crop.x,
          y: header.rect.y + header.rect.height,
          width: content.width * crop.width,
          height: content.height * crop.height,
        },
        radius: 0,
        shape: 'hard-rect',
      },
    };
  }
  // The existing window group clips both transformed sources; crop coverage affects video only.
  if (header) sourceLayers.unshift(header);
  sourceLayers.push({ ...mask, blend: 'mask' });
  const sourceBody: GpuPreviewLayer[] = [
    raster(
      (context) =>
        paintNativeGpuDecoration(context, {
          ...resolveVideoWindowMedia(bare, dimensions, 1, args.imageBank),
          frame: bare,
        }),
      true
    ),
    groupLayer(sourceLayers, true),
  ];
  let body: GpuPreviewLayer[] = layer.effectActionsOnly ? [] : [...sourceBody];
  if (!layer.effectActionsOnly && layer.spotlights?.length) {
    const snapshot = groupLayer(body, true);
    const modified = spotlight(
      body,
      layer.spotlights.map((state) =>
        sampleCompositionSpotlightLayer({
          state,
          window:
            state.coordinateSpace === 'source-window'
              ? getFittedMediaOriginalWindowFrame(media)
              : window,
          extent: window,
          projection: IDENTITY,
          scale: 1,
          clip: { rect: window, radius: layer.clip.windowCornerRadius ?? 0 },
        })
      )
    );
    const windowMask = raster(traceWindow, true);
    body = [
      snapshot,
      { ...windowMask, blend: 'erase' },
      { ...groupLayer([...modified, { ...windowMask, blend: 'mask' }], true), blend: 'add' },
    ];
  }
  const sourceSnapshot = groupLayer(sourceBody, true);
  for (const action of layer.actions ?? []) {
    const feedback = action.gestureFeedback;
    if (feedback?.effect !== 'magnify' || !feedback.lens || feedback.lens.scale <= 1) continue;
    const actionScale =
      (content.width / media.sourceWidth + content.height / media.sourceHeight) / 2;
    const sourcePoint = action.point ?? feedback.point;
    const point = {
      x: content.x + sourcePoint.x * content.width,
      y: content.y + sourcePoint.y * content.height,
    };
    if (layer.trackRole === 'CAMERA' && layer.clip.cameraMirrored)
      point.x = 2 * layer.x + layer.width - point.x;
    const projected = layer.sourceContentTransform
      ? projectQuickEditPoint(layer.sourceContentTransform, point)
      : point;
    if (!projected) throw new Error('Pointer lens projection is unavailable.');
    const innerScale = layer.sourceContentTransform
      ? Math.hypot(layer.sourceContentTransform[0], layer.sourceContentTransform[3])
      : 1;
    const radius = feedback.radius * actionScale * innerScale;
    const bounds = {
      x: projected.x - radius,
      y: projected.y - radius,
      width: radius * 2,
      height: radius * 2,
    };
    const shape = feedback.lens.shape;
    const trace = (context: CanvasRenderingContext2D) => {
      context.beginPath();
      if (shape === 'circle') context.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
      else context.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius * 0.18);
    };
    body.push(
      raster(
        (context) =>
          drawPointerFeedbackLensShadow(context, {
            ...feedback,
            point: projected,
            radius,
            stroke: feedback.stroke * Math.max(0.2, actionScale) * innerScale,
          }),
        true
      )
    );
    body.push(
      groupLayer(
        [
          {
            ...sourceSnapshot,
            lens: {
              bounds,
              scale: feedback.lens.scale,
              optics: feedback.lens.optics ?? 'flat',
              edgeWidth: feedback.lens.edgeWidth ?? 8,
              corner: shape === 'circle' ? 'circle' : 0.18,
            },
            clip: {
              rect: bounds,
              radius: radius * 0.18,
              ...(shape === 'circle' ? { shape: 'ellipse' } : {}),
            },
          },
        ],
        true
      )
    );
    body.push(
      raster((context) => {
        context.save();
        trace(context);
        context.globalAlpha = feedback.opacity;
        context.strokeStyle = feedback.color;
        context.lineWidth = feedback.stroke * Math.max(0.2, actionScale);
        context.stroke();
        context.restore();
      }, true)
    );
  }
  if (layer.actions?.length || layer.borders?.length)
    body.push(
      raster(
        (context) =>
          drawCompositionVisualLayer(
            context,
            {
              ...bare,
              effectActionsOnly: true,
              deferSourceBorders: !layer.effectActionsOnly || layer.deferSourceBorders === true,
              actions:
                layer.actions?.filter((action) => action.gestureFeedback?.effect !== 'magnify') ??
                [],
              borders: layer.borders ?? [],
            },
            1,
            1,
            args.imageBank,
            args.media
          ),
        true
      )
    );
  return [
    {
      ...groupLayer(body, true),
      inverse,
      opacity: layer.opacity,
      blur: layer.renderState.blurAmount,
    },
  ];
}
