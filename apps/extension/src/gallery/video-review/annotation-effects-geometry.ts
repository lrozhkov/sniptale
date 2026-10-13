import {
  mapEffectV1ObjectPoint,
  type EffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';
import {
  computeQuickEditSceneLayout,
  computeQuickEditSceneCamera,
  computeQuickEditSpatialRasterLayout,
  computeQuickEditSpatialWindow,
} from '../../features/video/review/advanced/scene';
import {
  invertQuickEditProjection,
  projectQuickEditPoint,
  quickEditPlaneProjection,
  type QuickEditHomography,
} from '../../features/video/review/advanced/spatial-geometry';
import type { ReviewAnnotationEffect } from '../../features/video/review/annotation-effects/types';
import {
  resolveReviewAnnotationEffectBox,
  resolveReviewAnnotationEffectControls,
  transformReviewAnnotationEffectAttachment,
} from '../../features/video/review/annotation-effects/layout';

type Size = { width: number; height: number };
type Point = { x: number; y: number };
const identity: QuickEditHomography = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Canonical source/output mapping; CSS fitting never changes these attachment planes. */
export interface ReviewAnnotationGeometry {
  content: Size;
  viewport: Size;
  contentToViewport: QuickEditHomography;
  viewportToContent: QuickEditHomography;
  clip: {
    rect: { x: number; y: number; width: number; height: number };
    radius: number;
    projection: QuickEditHomography;
  };
}

/** Same raster-local source affine and projected window as the prepared overlay painter. */
export function createReviewAnnotationGeometry(
  input: Parameters<typeof computeQuickEditSceneLayout>[0]
): ReviewAnnotationGeometry | null {
  if (
    ![input.source.width, input.source.height, input.output.width, input.output.height].every(
      (value) => Number.isFinite(value) && value > 0
    )
  )
    return null;
  const layout = computeQuickEditSceneLayout(input);
  const raster = layout.spatial
    ? computeQuickEditSpatialRasterLayout(layout, input.background)
    : layout;
  const projection = layout.spatial
    ? quickEditPlaneProjection(
        layout.windowRect,
        computeQuickEditSpatialWindow(layout, input.background),
        layout.spatial
      )
    : identity;
  const video = raster.videoTransform;
  const sx = video.width / input.source.width,
    sy = video.height / input.source.height;
  const [a, b, c, d, e, f, g, h, i] = projection;
  const matrix: QuickEditHomography = [
    a * sx,
    b * sy,
    a * video.x + b * video.y + c,
    d * sx,
    e * sy,
    d * video.x + e * video.y + f,
    g * sx,
    h * sy,
    g * video.x + h * video.y + i,
  ];
  if (!matrix.every(Number.isFinite)) return null;
  const inverse = invertQuickEditProjection(matrix);
  if (!inverse) return null;
  const motion = computeQuickEditSceneCamera(
    raster,
    layout.spatial ? { ...input.background, zoomBehavior: 'fixed' } : input.background
  );
  const authoredWidth = input.canvas?.width ?? input.source.width;
  return {
    content: { width: input.source.width, height: input.source.height },
    viewport: { width: input.output.width, height: input.output.height },
    contentToViewport: matrix,
    viewportToContent: inverse,
    clip: {
      rect: motion.windowClip,
      radius: input.background.enabled
        ? ((input.background.layout.cornerRadius * input.output.width) / authoredWidth) *
          motion.scale
        : 0,
      projection,
    },
  };
}

/** Convert a canonical output pointer through the exact inverse of the painted content. */
export function reviewAnnotationPlanePoint(
  geometry: ReviewAnnotationGeometry,
  attachment: ReviewAnnotationEffect['attachment'],
  point: Point
) {
  return projectQuickEditPoint(
    attachment === 'content' ? geometry.viewportToContent : identity,
    point
  );
}

/** Shared visible body corners and fixed scene handles for canvas hit/contour interaction. */
export function reviewAnnotationBodyGeometry(
  instance: ReviewAnnotationEffect,
  document: EffectV1Document,
  geometry: ReviewAnnotationGeometry
) {
  const plane = geometry[instance.attachment];
  const matrix = instance.attachment === 'content' ? geometry.contentToViewport : identity;
  const box = resolveReviewAnnotationEffectBox(instance.transform, plane);
  const cos = Math.cos(box.rotation),
    sin = Math.sin(box.rotation);
  const corner = (x: number, y: number) =>
    projectQuickEditPoint(matrix, {
      x: box.x + box.width / 2 + x * cos - y * sin,
      y: box.y + box.height / 2 + x * sin + y * cos,
    });
  const corners = [
    corner(-box.width / 2, -box.height / 2),
    corner(box.width / 2, -box.height / 2),
    corner(box.width / 2, box.height / 2),
    corner(-box.width / 2, box.height / 2),
  ];
  if (corners.some((point) => !point)) return null;
  const handles = (document.objectLayout?.handles ?? []).map((handle) => {
    const anchor = instance.anchors?.[handle.id];
    return {
      id: handle.id,
      label: handle.label,
      point: anchor
        ? projectQuickEditPoint(matrix, { x: anchor.x * plane.width, y: anchor.y * plane.height })
        : null,
    };
  });
  return {
    corners: corners.filter((point): point is Point => point !== null),
    handles,
    box,
    plane,
  };
}

/** Preserve exact bodies or locally flatten perspective, keeping every independent anchor exact. */
export function convertReviewAnnotationAttachment(
  instance: ReviewAnnotationEffect,
  attachment: ReviewAnnotationEffect['attachment'],
  geometry: ReviewAnnotationGeometry
): ReviewAnnotationEffect | null {
  if (attachment === instance.attachment) return instance;
  const matrix =
    instance.attachment === 'content' ? geometry.contentToViewport : geometry.viewportToContent;
  const from = geometry[instance.attachment],
    to = geometry[attachment];
  const transform = transformReviewAnnotationEffectAttachment(instance.transform, from, to, matrix);
  if (!transform) return null;
  const anchors: Record<string, Point> = {};
  for (const [id, anchor] of Object.entries(instance.anchors ?? {})) {
    const point = projectQuickEditPoint(matrix, {
      x: anchor.x * from.width,
      y: anchor.y * from.height,
    });
    if (!point) return null;
    const normalized = { x: point.x / to.width, y: point.y / to.height };
    if (
      ![normalized.x, normalized.y].every(
        (value) => Number.isFinite(value) && value >= -16 && value <= 16
      )
    )
      return null;
    anchors[id] = normalized;
  }
  return { ...instance, attachment, transform, ...(instance.anchors ? { anchors } : {}) };
}

/** A bound numeric handle field changes its fixed scene anchor, not an instance control override. */
export function changeReviewAnnotationBoundControl(
  instance: ReviewAnnotationEffect,
  document: EffectV1Document,
  geometry: ReviewAnnotationGeometry,
  controlId: string,
  value: number
): ReviewAnnotationEffect['anchors'] | null {
  const layout = document.objectLayout;
  const handle = layout?.handles?.find(
    (item) => item.xControl === controlId || item.yControl === controlId
  );
  if (!layout || !handle || !instance.anchors || !Number.isFinite(value)) return null;
  const plane = geometry[instance.attachment];
  const controls = resolveReviewAnnotationEffectControls(document, instance, plane);
  const x = controlId === handle.xControl ? value : controls[handle.xControl];
  const y = controlId === handle.yControl ? value : controls[handle.yControl];
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  const point = mapEffectV1ObjectPoint(
    layout,
    resolveReviewAnnotationEffectBox(instance.transform, plane),
    { x, y }
  );
  return {
    ...instance.anchors,
    [handle.id]: { x: point.x / plane.width, y: point.y / plane.height },
  };
}

/** Computes an admitted drag on its canonical plane; the overlay owns capture and transaction lifetime. */
export function previewReviewAnnotationDrag(args: {
  instance: ReviewAnnotationEffect;
  document: EffectV1Document;
  geometry: ReviewAnnotationGeometry;
  start: Point;
  point: Point;
  kind: 'move' | 'resize' | 'rotate' | { anchor: string };
}): Partial<Pick<ReviewAnnotationEffect, 'transform' | 'anchors'>> | undefined {
  const { instance, start, point, geometry, kind, document } = args;
  if (point.x === start.x && point.y === start.y) return;
  const plane = geometry[instance.attachment];
  const before = instance.transform;
  if (typeof kind === 'object') {
    return {
      anchors: {
        ...instance.anchors,
        [kind.anchor]: {
          x: (instance.anchors?.[kind.anchor]?.x ?? 0) + (point.x - start.x) / plane.width,
          y: (instance.anchors?.[kind.anchor]?.y ?? 0) + (point.y - start.y) / plane.height,
        },
      },
    };
  }
  if (kind === 'move') {
    return {
      transform: {
        ...before,
        x: before.x + (point.x - start.x) / plane.width,
        y: before.y + (point.y - start.y) / plane.height,
      },
    };
  }
  if (kind === 'rotate') {
    const center = {
      x: (before.x + before.width / 2) * plane.width,
      y: (before.y + before.height / 2) * plane.height,
    };
    const rotation =
      before.rotation +
      Math.atan2(point.y - center.y, point.x - center.x) -
      Math.atan2(start.y - center.y, start.x - center.x);
    return {
      transform: { ...before, rotation: Math.atan2(Math.sin(rotation), Math.cos(rotation)) },
    };
  }
  {
    const cos = Math.cos(before.rotation),
      sin = Math.sin(before.rotation);
    const w = before.width * plane.width,
      h = before.height * plane.height;
    const corner = {
      x: (before.x + before.width / 2) * plane.width - (w / 2) * cos + (h / 2) * sin,
      y: (before.y + before.height / 2) * plane.height - (w / 2) * sin - (h / 2) * cos,
    };
    const dx = w * cos - h * sin + point.x - start.x,
      dy = w * sin + h * cos + point.y - start.y;
    let width = Math.max(1, dx * cos + dy * sin),
      height = Math.max(1, -dx * sin + dy * cos);
    const layout = document.objectLayout;
    if (layout?.resize === 'scale') {
      const scale =
        Math.abs(width - w) / w >= Math.abs(height - h) / h
          ? width / layout.width
          : height / layout.height;
      width = scale * layout.width;
      height = scale * layout.height;
    }
    const cx = corner.x + (width / 2) * cos - (height / 2) * sin,
      cy = corner.y + (width / 2) * sin + (height / 2) * cos;
    return {
      transform: {
        ...before,
        x: (cx - width / 2) / plane.width,
        y: (cy - height / 2) / plane.height,
        width: width / plane.width,
        height: height / plane.height,
      },
    };
  }
}
