import type { AnimationTemplate } from '@sniptale/runtime-contracts/animation-template';
import type { ReviewAnnotationEffect } from '../../features/video/review/annotation-effects/types';
import { projectQuickEditPoint } from '../../features/video/composition/motion/spatial-geometry';
import {
  reviewAnnotationBodyGeometry,
  reviewAnnotationPlanePoint,
  type ReviewAnnotationGeometry,
} from './annotation-effects-geometry';

type Point = { x: number; y: number };
type Axis = 'x' | 'y';
type Lock = { target: number; anchor: number };
export type AnnotationMagnetLocks = Partial<Record<Axis, Lock>>;
export type AnnotationMagnetGuide = { start: Point; end: Point };
type Targets = Record<Axis, number[]>;
type Body = { instance: ReviewAnnotationEffect; document: AnimationTemplate };

function bounds(body: Body, geometry: ReviewAnnotationGeometry) {
  const shape = reviewAnnotationBodyGeometry(body.instance, body.document, geometry);
  if (!shape) return null;
  const points = shape.corners.map((point) =>
    reviewAnnotationPlanePoint(geometry, body.instance.attachment, point)
  );
  if (points.some((point) => !point)) return null;
  const valid = points.filter((point): point is Point => point !== null);
  const x = valid.map((point) => point.x),
    y = valid.map((point) => point.y);
  const minX = Math.min(...x),
    maxX = Math.max(...x);
  const minY = Math.min(...y),
    maxY = Math.max(...y);
  return { x: [minX, (minX + maxX) / 2, maxX], y: [minY, (minY + maxY) / 2, maxY] };
}

/** Freeze alignment candidates once per gesture; the caller supplies temporally active peers. */
export function reviewAnnotationMagnetTargets(
  selected: ReviewAnnotationEffect,
  peers: readonly Body[],
  geometry: ReviewAnnotationGeometry
): Targets {
  const plane = geometry[selected.attachment];
  const targets = { x: [0, plane.width / 2, plane.width], y: [0, plane.height / 2, plane.height] };
  for (const peer of peers) {
    if (
      peer.instance.id === selected.id ||
      !peer.instance.enabled ||
      peer.instance.attachment !== selected.attachment
    )
      continue;
    const box = bounds(peer, geometry);
    if (box) {
      targets.x.push(...box.x);
      targets.y.push(...box.y);
    }
  }
  return targets;
}

/** Snap translation in CSS pixels, while storing placement and drawing guides on the shared plane. */
export function snapReviewAnnotation(
  args: Body & {
    geometry: ReviewAnnotationGeometry;
    size: { width: number; height: number };
    targets: Targets;
    locks: AnnotationMagnetLocks;
    bypass?: boolean;
  }
) {
  const { instance, document, geometry, size, targets } = args;
  const transform = { ...instance.transform };
  const locks: AnnotationMagnetLocks = {};
  const guides: AnnotationMagnetGuide[] = [];
  const box = bounds({ instance, document }, geometry);
  const plane = geometry[instance.attachment];
  const project = (point: Point) =>
    instance.attachment === 'content'
      ? projectQuickEditPoint(geometry.contentToViewport, point)
      : point;
  if (args.bypass || !box || !(size.width > 0 && size.height > 0))
    return { transform, locks, guides };
  for (const axis of ['x', 'y'] as const) {
    const other = axis === 'x' ? 'y' : 'x';
    const center = box[other][1];
    if (center === undefined) continue;
    const distance = (anchor: number, target: number) => {
      const start = project(axis === 'x' ? { x: anchor, y: center } : { x: center, y: anchor });
      const end = project(axis === 'x' ? { x: target, y: center } : { x: center, y: target });
      return start && end
        ? Math.hypot(
            ((end.x - start.x) * size.width) / geometry.viewport.width,
            ((end.y - start.y) * size.height) / geometry.viewport.height
          )
        : Infinity;
    };
    let best: Lock | undefined;
    const previous = args.locks[axis];
    if (
      previous &&
      box[axis][previous.anchor] !== undefined &&
      distance(box[axis][previous.anchor]!, previous.target) <= 10
    )
      best = previous;
    if (!best) {
      let nearest = 6;
      for (const target of targets[axis])
        for (const [anchor, value] of box[axis].entries()) {
          const delta = distance(value, target);
          if (delta < nearest) {
            nearest = delta;
            best = { target, anchor };
          }
        }
    }
    if (!best) continue;
    const value = box[axis][best.anchor];
    if (value === undefined) continue;
    const length = axis === 'x' ? plane.width : plane.height;
    const next = transform[axis] + (best.target - value) / length;
    if (!Number.isFinite(next) || Math.abs(next) > 16) continue;
    const start = project(axis === 'x' ? { x: best.target, y: 0 } : { x: 0, y: best.target });
    const end = project(
      axis === 'x' ? { x: best.target, y: plane.height } : { x: plane.width, y: best.target }
    );
    if (!start || !end) continue;
    transform[axis] = next;
    locks[axis] = best;
    guides.push({ start, end });
  }
  return { transform, locks, guides };
}
