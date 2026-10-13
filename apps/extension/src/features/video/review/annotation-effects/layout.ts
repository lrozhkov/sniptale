import {
  mapEffectV1ObjectPoint,
  mapEffectV1ScenePoint,
  resolveEffectV1ControlDefault,
  type EffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';
import {
  invertQuickEditProjection,
  projectQuickEditPoint,
  type QuickEditHomography,
} from '../advanced/spatial-geometry';
import type { ReviewAnnotationEffect, ReviewAnnotationEffectTransform } from './types';

type Size = { width: number; height: number };
type Point = { x: number; y: number };

/** Converts canonical fractions once for SDK layout, painting and body/handle hit geometry. */
export function resolveReviewAnnotationEffectBox(
  transform: ReviewAnnotationEffectTransform,
  plane: Size
) {
  return {
    x: transform.x * plane.width,
    y: transform.y * plane.height,
    width: transform.width * plane.width,
    height: transform.height * plane.height,
    rotation: transform.rotation,
  };
}

/** Anchors remain in the annotation plane when the body is moved or resized. */
export function resolveReviewAnnotationEffectControls(
  document: EffectV1Document,
  instance: ReviewAnnotationEffect,
  plane: Size
) {
  const controls = {
    ...Object.fromEntries(
      document.controls.map((control) => [control.id, resolveEffectV1ControlDefault(control, 'en')])
    ),
    ...instance.controls,
  };
  const layout = document.objectLayout;
  if (!layout) return controls;
  const box = resolveReviewAnnotationEffectBox(instance.transform, plane);
  for (const handle of layout.handles ?? []) {
    const anchor = instance.anchors?.[handle.id];
    if (!anchor) throw new Error('Missing annotation anchor.');
    const point = mapEffectV1ScenePoint(layout, box, {
      x: anchor.x * plane.width,
      y: anchor.y * plane.height,
    });
    controls[handle.xControl] = point.x;
    controls[handle.yControl] = point.y;
  }
  return controls;
}

/** New anchors use declared control defaults/presets without clipping an external tip to the body. */
export function initializeReviewAnnotationEffectAnchors(
  document: EffectV1Document,
  transform: ReviewAnnotationEffectTransform,
  controls: Readonly<Record<string, number | string>>,
  plane: Size
) {
  const layout = document.objectLayout;
  if (!layout?.handles?.length) return undefined;
  const box = resolveReviewAnnotationEffectBox(transform, plane);
  return Object.fromEntries(
    layout.handles.map((handle) => {
      const x = controls[handle.xControl],
        y = controls[handle.yControl];
      if (typeof x !== 'number' || typeof y !== 'number')
        throw new Error('Invalid annotation anchor default.');
      const point = mapEffectV1ObjectPoint(layout, box, { x, y });
      return [handle.id, { x: point.x / plane.width, y: point.y / plane.height }];
    })
  );
}

/** Fits a new annotation and binds declared anchors without retaining plane-bound handle controls. */
export function initializeReviewAnnotationPlacement(
  document: EffectV1Document,
  values: Readonly<Record<string, string | number>>,
  plane: Size
) {
  const layout = document.objectLayout;
  const scale = layout
    ? Math.min(1, (plane.width * 0.8) / layout.width, (plane.height * 0.8) / layout.height)
    : 1;
  const width = layout ? (layout.width * scale) / plane.width : 1;
  const height = layout ? (layout.height * scale) / plane.height : 1;
  const transform = { x: (1 - width) / 2, y: (1 - height) / 2, width, height, rotation: 0 };
  const anchors = initializeReviewAnnotationEffectAnchors(document, transform, values, plane);
  const controls = { ...values };
  for (const handle of layout?.handles ?? []) {
    delete controls[handle.xControl];
    delete controls[handle.yControl];
  }
  return { transform, controls, anchors };
}

/** One projection serves visible body corners, handles and inverse pointer admission. */
export function mapReviewAnnotationEffectPoint(
  point: Point,
  projection: QuickEditHomography,
  inverse = false
) {
  const matrix = inverse ? invertQuickEditProjection(projection) : projection;
  return matrix ? projectQuickEditPoint(matrix, point) : null;
}

/** Exact rectangles keep their corners; projective/sheared bodies retain center and local axis scales. */
export function transformReviewAnnotationEffectAttachment(
  transform: ReviewAnnotationEffectTransform,
  from: Size,
  to: Size,
  mapping: QuickEditHomography
): ReviewAnnotationEffectTransform | null {
  if (
    ![from.width, from.height, to.width, to.height].every(
      (value) => Number.isFinite(value) && value > 0
    ) ||
    !mapping.every(Number.isFinite) ||
    !invertQuickEditProjection(mapping)
  )
    return null;
  const box = resolveReviewAnnotationEffectBox(transform, from);
  const cos = Math.cos(box.rotation),
    sin = Math.sin(box.rotation);
  const corner = (x: number, y: number) =>
    projectQuickEditPoint(mapping, {
      x: box.x + box.width / 2 + x * cos - y * sin,
      y: box.y + box.height / 2 + x * sin + y * cos,
    });
  const a = corner(-box.width / 2, -box.height / 2),
    b = corner(box.width / 2, -box.height / 2),
    c = corner(box.width / 2, box.height / 2),
    d = corner(-box.width / 2, box.height / 2);
  if (
    !a ||
    !b ||
    !c ||
    !d ||
    ![a, b, c, d].every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  )
    return null;
  const u = { x: b.x - a.x, y: b.y - a.y },
    v = { x: d.x - a.x, y: d.y - a.y };
  const width = Math.hypot(u.x, u.y),
    height = Math.hypot(v.x, v.y);
  const tolerance = Math.max(width, height, 1) * 1e-7;
  if (width <= 0 || height <= 0 || u.x * v.y - u.y * v.x <= 0) return null;
  if (
    Math.hypot(c.x - b.x - v.x, c.y - b.y - v.y) > tolerance ||
    Math.abs(u.x * v.x + u.y * v.y) > tolerance * Math.max(width, height)
  )
    return flattenMappedAnnotationBody(box, to, mapping);
  const center = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
  return admitMappedAnnotationBody({
    x: (center.x - width / 2) / to.width,
    y: (center.y - height / 2) / to.height,
    width: width / to.width,
    height: height / to.height,
    rotation: Math.atan2(u.y, u.x),
  });
}

function admitMappedAnnotationBody(transform: ReviewAnnotationEffectTransform) {
  if (
    !Object.values(transform).every(Number.isFinite) ||
    [transform.x, transform.y].some((value) => value < -16 || value > 16) ||
    [transform.width, transform.height].some((value) => value < 1e-6 || value > 16)
  )
    return null;
  return transform;
}

/** Local flattening removes shear while projecting the center rather than averaging distant corners. */
function flattenMappedAnnotationBody(
  box: ReturnType<typeof resolveReviewAnnotationEffectBox>,
  to: Size,
  mapping: QuickEditHomography
) {
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const center = projectQuickEditPoint(mapping, point);
  if (!center) return null;
  const [a, b, , d, e, , g, h, i] = mapping;
  const w = g * point.x + h * point.y + i;
  const j00 = (a - center.x * g) / w,
    j01 = (b - center.x * h) / w;
  const j10 = (d - center.y * g) / w,
    j11 = (e - center.y * h) / w;
  const cos = Math.cos(box.rotation),
    sin = Math.sin(box.rotation);
  const u = { x: (j00 * cos + j01 * sin) * box.width, y: (j10 * cos + j11 * sin) * box.width };
  const v = { x: (-j00 * sin + j01 * cos) * box.height, y: (-j10 * sin + j11 * cos) * box.height };
  if (
    ![j00, j01, j10, j11, u.x, u.y, v.x, v.y].every(Number.isFinite) ||
    u.x * v.y - u.y * v.x <= 0
  )
    return null;
  const width = Math.hypot(u.x, u.y),
    height = Math.hypot(v.x, v.y);
  return admitMappedAnnotationBody({
    x: (center.x - width / 2) / to.width,
    y: (center.y - height / 2) / to.height,
    width: width / to.width,
    height: height / to.height,
    rotation: Math.atan2(u.y, u.x),
  });
}
