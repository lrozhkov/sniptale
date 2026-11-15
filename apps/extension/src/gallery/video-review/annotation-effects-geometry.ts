import {
  mapAnimationObjectPoint,
  mapAnimationScenePoint,
  type AnimationTemplate,
} from '@sniptale/runtime-contracts/animation-template';
import {
  computeQuickEditSceneLayout,
  computeQuickEditSceneCamera,
  computeQuickEditSpatialRasterLayout,
  computeQuickEditSpatialWindow,
  quickEditVisibleVideoTransform,
} from '../../features/video/review/advanced/scene';
import {
  invertQuickEditProjection,
  projectQuickEditPoint,
  quickEditPlaneProjection,
  type QuickEditHomography,
} from '../../features/video/composition/motion/spatial-geometry';
import type { ReviewAnnotationEffect } from '../../features/video/review/annotation-effects/types';
import {
  resolveReviewAnnotationEffectBox,
  resolveReviewAnnotationEffectControls,
  transformReviewAnnotationEffectAttachment,
} from '../../features/video/review/annotation-effects/layout';

type Size = { width: number; height: number };
type Point = { x: number; y: number };
type BodyBounds = { x: number; y: number; width: number; height: number };
const measuredBodies = new WeakMap<AnimationTemplate, Map<string, BodyBounds>>();
/** The editor measurement cache follows content and source identity, independently of parsed object references. */
export function reviewAnnotationBodyMeasurementKey(
  instance: Pick<ReviewAnnotationEffect, 'snapshotId'>,
  controls: Readonly<Record<string, unknown>>
) {
  return JSON.stringify([
    instance.snapshotId,
    Object.entries(controls).map(([key, value]) => [
      key,
      typeof value === 'number' ? Math.round(value * 1e7) / 1e7 : value,
    ]),
  ]);
}

/** Advisory reference bounds share the same source coordinate system as rendering and handles. */
export function setReviewAnnotationBodyBounds(
  document: AnimationTemplate,
  id: string,
  bounds: BodyBounds
) {
  let bodies = measuredBodies.get(document);
  if (!bodies) {
    bodies = new Map();
    measuredBodies.set(document, bodies);
  }
  bodies.set(id, bounds);
}
const identity: QuickEditHomography = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Canonical source/output mapping; CSS fitting never changes these attachment planes. */
export interface ReviewAnnotationGeometry {
  content: Size;
  viewport: Size;
  contentToViewport: QuickEditHomography;
  viewportToContent: QuickEditHomography;
  clip: {
    rect: { x: number; y: number; width: number; height: number };
    crop?: { x: number; y: number; width: number; height: number };
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
      ...(raster.sourceCrop ? { crop: quickEditVisibleVideoTransform(raster) } : {}),
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
  document: AnimationTemplate,
  geometry: ReviewAnnotationGeometry
) {
  const plane = geometry[instance.attachment];
  const matrix = instance.attachment === 'content' ? geometry.contentToViewport : identity;
  const box = resolveReviewAnnotationEffectBox(instance.transform, plane);
  const bounds = measuredBodies.get(document)?.get(instance.id) ?? {
    x: 0,
    y: 0,
    width: document.animation.w,
    height: document.animation.h,
  };
  const corner = (x: number, y: number) =>
    projectQuickEditPoint(matrix, mapAnimationObjectPoint(document, box, { x, y }));
  const corners = [
    corner(bounds.x, bounds.y),
    corner(bounds.x + bounds.width, bounds.y),
    corner(bounds.x + bounds.width, bounds.y + bounds.height),
    corner(bounds.x, bounds.y + bounds.height),
  ];
  if (corners.some((point) => !point)) return null;
  const effectiveControls = document.objectLayout?.handles?.every(
    (handle) => instance.anchors?.[handle.id]
  )
    ? resolveReviewAnnotationEffectControls(document, instance, plane)
    : null;
  const handles = (document.objectLayout?.handles ?? []).map((handle) => {
    const anchor = instance.anchors?.[handle.id];
    let point = anchor ? { x: anchor.x * plane.width, y: anchor.y * plane.height } : null;
    const x = effectiveControls?.[handle.xControl],
      y = effectiveControls?.[handle.yControl];
    if (point && typeof x === 'number' && typeof y === 'number') {
      const local = mapAnimationScenePoint(document, box, point);
      // Keep the original scene point exact when only the runtime's 1e-10 rounding differs.
      if (Math.abs(local.x - x) > 1e-7 || Math.abs(local.y - y) > 1e-7)
        point = mapAnimationObjectPoint(document, box, { x, y });
    }
    return {
      id: handle.id,
      label: handle.label,
      point: point ? projectQuickEditPoint(matrix, point) : null,
    };
  });
  return {
    corners: corners.filter((point): point is Point => point !== null),
    handles,
    box,
    origin: mapAnimationObjectPoint(document, box, { x: bounds.x, y: bounds.y }),
    size: {
      width: (bounds.width * box.width) / document.animation.w,
      height: (bounds.height * box.height) / document.animation.h,
    },
    center: mapAnimationObjectPoint(document, box, {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    }),
    plane,
  };
}

/** Inspector and canvas gestures use the visible body, not the transparent source artboard. */
export function changeReviewAnnotationBodyTransform(
  instance: ReviewAnnotationEffect,
  document: AnimationTemplate,
  geometry: ReviewAnnotationGeometry,
  change: { x?: number; y?: number; width?: number; height?: number; rotation?: number },
  pivotOverride?: Point
): ReviewAnnotationEffect['transform'] {
  const body = reviewAnnotationBodyGeometry(instance, document, geometry);
  const before = instance.transform;
  if (!body) return before;
  const plane = geometry[instance.attachment];
  if (change.width !== undefined || change.height !== undefined) {
    const aspect = (document.animation.w * plane.height) / (document.animation.h * plane.width);
    const requestedWidth =
      change.width !== undefined
        ? (before.width * change.width * plane.width) / body.size.width
        : ((before.height * change.height! * plane.height) / body.size.height) * aspect;
    const width = Math.max(
      Math.max(1e-6, 1e-6 * aspect),
      Math.min(Math.min(16, 16 * aspect), requestedWidth)
    );
    const height = width / aspect;
    const sx = width / before.width,
      sy = height / before.height;
    const pivot = pivotOverride ?? body.origin;
    const cx = (before.x + before.width / 2) * plane.width,
      cy = (before.y + before.height / 2) * plane.height;
    // Scale the center offset in the body's local axes, including imported stretched placements.
    const cos = Math.cos(before.rotation),
      sin = Math.sin(before.rotation);
    const dx = cx - pivot.x,
      dy = cy - pivot.y;
    const localX = (dx * cos + dy * sin) * sx,
      localY = (-dx * sin + dy * cos) * sy;
    return {
      ...before,
      width,
      height,
      x: (pivot.x + localX * cos - localY * sin) / plane.width - width / 2,
      y: (pivot.y + localX * sin + localY * cos) / plane.height - height / 2,
    };
  }

  if (change.rotation !== undefined) {
    const delta = change.rotation - before.rotation;
    const dx = (before.x + before.width / 2) * plane.width - body.center.x;
    const dy = (before.y + before.height / 2) * plane.height - body.center.y;
    if (Math.hypot(dx, dy) <= Number.EPSILON * Math.max(plane.width, plane.height) * 8)
      return { ...before, rotation: change.rotation };
    return {
      ...before,
      rotation: change.rotation,
      x:
        (body.center.x + dx * Math.cos(delta) - dy * Math.sin(delta)) / plane.width -
        before.width / 2,
      y:
        (body.center.y + dx * Math.sin(delta) + dy * Math.cos(delta)) / plane.height -
        before.height / 2,
    };
  }
  return {
    ...before,
    x: before.x + (change.x === undefined ? 0 : change.x - body.origin.x / plane.width),
    y: before.y + (change.y === undefined ? 0 : change.y - body.origin.y / plane.height),
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

/** Keep the persisted scene handle and the sandbox's declared local controls equivalent. */
function constrainReviewAnnotationAnchor(
  instance: ReviewAnnotationEffect,
  document: AnimationTemplate,
  geometry: ReviewAnnotationGeometry,
  id: string,
  point: Point
) {
  const handle = document.objectLayout?.handles?.find((handle) => handle.id === id);
  if (!handle || !instance.anchors || ![point.x, point.y].every(Number.isFinite)) return null;
  const plane = geometry[instance.attachment],
    box = resolveReviewAnnotationEffectBox(instance.transform, plane);
  const local = mapAnimationScenePoint(document, box, point);
  const clamp = (controlId: string, value: number) => {
    const control = document.controls.find((control) => control.id === controlId);
    if (control?.kind !== 'number') return null;
    return Math.max(control.min ?? -Infinity, Math.min(control.max ?? Infinity, value));
  };
  const x = clamp(handle.xControl, local.x),
    y = clamp(handle.yControl, local.y);
  if (x === null || y === null) return null;
  const admitted = mapAnimationObjectPoint(document, box, { x, y });
  return {
    ...instance.anchors,
    [id]: { x: admitted.x / plane.width, y: admitted.y / plane.height },
  };
}

/** A bound numeric handle field changes its fixed scene anchor, not an instance control override. */
export function changeReviewAnnotationBoundControl(
  instance: ReviewAnnotationEffect,
  document: AnimationTemplate,
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
  const point = mapAnimationObjectPoint(
    document,
    resolveReviewAnnotationEffectBox(instance.transform, plane),
    { x, y }
  );
  return constrainReviewAnnotationAnchor(instance, document, geometry, handle.id, point);
}

/** Computes an admitted drag on its canonical plane; the overlay owns capture and transaction lifetime. */
export function previewReviewAnnotationDrag(args: {
  instance: ReviewAnnotationEffect;
  document: AnimationTemplate;
  geometry: ReviewAnnotationGeometry;
  start: Point;
  point: Point;
  kind: 'move' | 'resize' | 'rotate' | { anchor: string } | { resize: 0 | 1 | 2 | 3 };
}): Partial<Pick<ReviewAnnotationEffect, 'transform' | 'anchors'>> | undefined {
  const { instance, start, point, geometry, kind, document } = args;
  if (point.x === start.x && point.y === start.y) return;
  const plane = geometry[instance.attachment];
  const before = instance.transform;
  if (typeof kind === 'object' && 'anchor' in kind) {
    const projected = reviewAnnotationBodyGeometry(instance, document, geometry)?.handles.find(
      (handle) => handle.id === kind.anchor
    )?.point;
    const anchor =
      projected && reviewAnnotationPlanePoint(geometry, instance.attachment, projected);
    if (!anchor) return;
    const anchors = constrainReviewAnnotationAnchor(instance, document, geometry, kind.anchor, {
      x: anchor.x + point.x - start.x,
      y: anchor.y + point.y - start.y,
    });
    return anchors ? { anchors } : undefined;
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
    const center = reviewAnnotationBodyGeometry(instance, document, geometry)?.center;
    if (!center) return;
    const rotation =
      before.rotation +
      Math.atan2(point.y - center.y, point.x - center.x) -
      Math.atan2(start.y - center.y, start.x - center.x);
    return {
      transform: changeReviewAnnotationBodyTransform(instance, document, geometry, {
        rotation: Math.atan2(Math.sin(rotation), Math.cos(rotation)),
      }),
    };
  }
  {
    const shape = reviewAnnotationBodyGeometry(instance, document, geometry);
    const index = typeof kind === 'object' ? kind.resize : 2;
    const corner = shape?.corners[index],
      opposite = shape?.corners[(index + 2) % 4];
    const pivot = opposite && reviewAnnotationPlanePoint(geometry, instance.attachment, opposite);
    const handle = corner && reviewAnnotationPlanePoint(geometry, instance.attachment, corner);
    if (!shape || !pivot || !handle) return;
    const cos = Math.cos(before.rotation),
      sin = Math.sin(before.rotation);
    const dx = handle.x - pivot.x,
      dy = handle.y - pivot.y;
    const localX = dx * cos + dy * sin,
      localY = -dx * sin + dy * cos;
    const moveX = (point.x - start.x) * cos + (point.y - start.y) * sin;
    const moveY = -(point.x - start.x) * sin + (point.y - start.y) * cos;
    const sx = 1 + moveX / localX,
      sy = 1 + moveY / localY;
    const scale = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy;
    return {
      transform: changeReviewAnnotationBodyTransform(
        instance,
        document,
        geometry,
        { width: (shape.size.width * Math.max(0.001, scale)) / plane.width },
        pivot
      ),
    };
  }
}
