import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUICK_EDIT_DEPTH,
  type SpatialQuaternion,
} from '../../features/video/review/advanced/spatial';
import {
  quickEditPlaneProjection,
  projectQuickEditPoint,
  type QuickEditHomography,
} from '../../features/video/review/advanced/spatial-geometry';
import {
  resolveReviewSpatialFocusGeometry,
  reviewSpatialFocusPatch,
  unprojectReviewSpatialPoint,
  type ReviewSpatialControlGeometryInput,
} from './spatial-control-geometry';

const identity: QuickEditHomography = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const input: ReviewSpatialControlGeometryInput = {
  plane: { x: 80, y: 45, width: 800, height: 540 },
  projection: identity,
  rotation: [0, 0, 0, 1],
  focus: { ...DEFAULT_QUICK_EDIT_DEPTH, enabled: true, mode: 'area', width: 0.2, softness: 0.08 },
};
const diagonal = Math.hypot(input.plane.width, input.plane.height);
const center = { x: 480, y: 315 };
function tilted(width: number, height: number): ReviewSpatialControlGeometryInput {
  // Rz(35) * Ry(60) * Rx(-55), computed independently of the UI helpers.
  const x = (-55 * Math.PI) / 360,
    y = (60 * Math.PI) / 360,
    z = (35 * Math.PI) / 360;
  const rotation: SpatialQuaternion = [
    Math.sin(x) * Math.cos(y) * Math.cos(z) - Math.cos(x) * Math.sin(y) * Math.sin(z),
    Math.cos(x) * Math.sin(y) * Math.cos(z) + Math.sin(x) * Math.cos(y) * Math.sin(z),
    Math.cos(x) * Math.cos(y) * Math.sin(z) - Math.sin(x) * Math.sin(y) * Math.cos(z),
    Math.cos(x) * Math.cos(y) * Math.cos(z) + Math.sin(x) * Math.sin(y) * Math.sin(z),
  ];
  const plane = { x: 70, y: 95, width, height };
  const target = { x: -30, y: 20, width: width * 1.7, height: height * 1.7 };
  const projection = quickEditPlaneProjection(plane, target, {
    rotation,
    perspective: 1,
    windowMotion: 1,
    lockBackground: true,
    focus: [],
  });
  return { ...input, plane, projection, rotation };
}

describe('decorated-plane focus contours', () => {
  it('uses the diagonal and decorated header/padding offset, not normalized-square radii', () => {
    const geometry = resolveReviewSpatialFocusGeometry(input)!;
    expect(geometry.center).toEqual(center);
    for (const [paths, threshold] of [
      [geometry.sharp, 0.1],
      [geometry.soft, 0.18],
    ] as const) {
      expect(paths.flat().length).toBeGreaterThan(10);
      for (const point of paths.flat())
        expect(Math.hypot(point.x - center.x, point.y - center.y)).toBeCloseTo(
          diagonal * threshold,
          8
        );
    }
  });

  it.each([
    [1440, 820],
    [600, 1100],
  ])('preserves shader metric at strong tilt for %sx%s decorated planes', (width, height) => {
    const source = tilted(width, height);
    const geometry = resolveReviewSpatialFocusGeometry(source)!;
    const expectedCenter = { x: source.plane.x + width / 2, y: source.plane.y + height / 2 };
    expect(reviewSpatialFocusPatch(source, 'center', geometry.center)).toEqual({
      x: source.focus.x,
      y: source.focus.y,
    });
    for (const [paths, threshold] of [
      [geometry.sharp, 0.1],
      [geometry.soft, 0.18],
    ] as const) {
      expect(paths.flat().length).toBeGreaterThan(10);
      for (const output of paths.flat()) {
        const point = unprojectReviewSpatialPoint(source.projection, output)!;
        expect(
          Math.hypot(point.x - expectedCenter.x, point.y - expectedCenter.y) /
            Math.hypot(width, height)
        ).toBeCloseTo(threshold, 8);
      }
    }
    for (const handle of geometry.handles) {
      expect(reviewSpatialFocusPatch(source, handle.kind, handle.point, handle.side)).toEqual({
        [handle.kind]: source.focus[handle.kind],
      });
    }
  });

  it('clips arcs at exact circle intersections without moving a handle off its threshold', () => {
    const source = { ...input, focus: { ...input.focus, x: 0.02, y: 0.1, width: 0.6 } };
    const geometry = resolveReviewSpatialFocusGeometry(source)!;
    expect(geometry.sharp.length).toBeGreaterThan(0);
    for (const point of geometry.sharp.flat()) {
      expect(point.x).toBeGreaterThanOrEqual(source.plane.x - 1e-7);
      expect(point.y).toBeGreaterThanOrEqual(source.plane.y - 1e-7);
      expect(point.x).toBeLessThanOrEqual(source.plane.x + source.plane.width + 1e-7);
      expect(point.y).toBeLessThanOrEqual(source.plane.y + source.plane.height + 1e-7);
      expect(
        Math.hypot(point.x - geometry.center.x, point.y - geometry.center.y) / diagonal
      ).toBeCloseTo(0.3, 8);
    }
    for (const handle of geometry.handles)
      expect(reviewSpatialFocusPatch(source, handle.kind, handle.point, handle.side)).toEqual({
        [handle.kind]: source.focus[handle.kind],
      });
  });

  it('does not invent visible boundaries or handles when the circle encloses the whole plane', () => {
    const geometry = resolveReviewSpatialFocusGeometry({
      ...input,
      focus: { ...input.focus, width: 1, softness: 1 },
    })!;
    expect(geometry.soft).toEqual([]);
    expect(geometry.handles.filter((handle) => handle.kind === 'softness')).toEqual([]);
  });

  it('uses raw depth-axis magnitude, with sharp/soft parallel lines instead of circles', () => {
    const angle = (30 * Math.PI) / 360;
    const source: ReviewSpatialControlGeometryInput = {
      ...input,
      rotation: [0, Math.sin(angle), 0, Math.cos(angle)],
      focus: { ...input.focus, mode: 'depth' },
    };
    const geometry = resolveReviewSpatialFocusGeometry(source)!;
    expect(geometry.flat).toBe(false);
    expect(geometry.sharp).toHaveLength(2);
    expect(geometry.soft).toHaveLength(2);
    for (const [paths, threshold] of [
      [geometry.sharp, 0.1],
      [geometry.soft, 0.18],
    ] as const) {
      for (const line of paths) {
        expect(line).toHaveLength(2);
        for (const point of line)
          expect(Math.abs((point.x - center.x) * -0.5) / diagonal).toBeCloseTo(threshold, 8);
      }
    }
    for (const handle of geometry.handles)
      expect(reviewSpatialFocusPatch(source, handle.kind, handle.point, handle.side)).toEqual({
        [handle.kind]: source.focus[handle.kind],
      });
    expect(
      reviewSpatialFocusPatch(source, 'width', { x: center.x + 100, y: center.y }, 1)
    ).toBeNull();
    expect(
      reviewSpatialFocusPatch(source, 'width', { x: center.x - 100, y: center.y }, 1)?.width
    ).toBeCloseTo(100 / diagonal, 8);
  });

  it('matches the oblique depth metric after strong perspective in portrait geometry', () => {
    const base = tilted(600, 1100);
    const source = { ...base, focus: { ...base.focus, mode: 'depth' as const } };
    const geometry = resolveReviewSpatialFocusGeometry(source)!;
    const axis = {
      x: -Math.sin(Math.PI / 3),
      y: Math.cos(Math.PI / 3) * Math.sin((-55 * Math.PI) / 180),
    };
    for (const [paths, threshold] of [
      [geometry.sharp, 0.1],
      [geometry.soft, 0.18],
    ] as const) {
      expect(paths).toHaveLength(2);
      for (const output of paths.flat()) {
        const p = unprojectReviewSpatialPoint(source.projection, output)!;
        const distance =
          Math.abs((p.x - 370) * axis.x + (p.y - 645) * axis.y) / Math.hypot(600, 1100);
        expect(distance).toBeCloseTo(threshold, 8);
      }
    }
  });

  it('reports frontal depth neutrally and leaves off-plane depth boundaries absent', () => {
    const frontal = { ...input, focus: { ...input.focus, mode: 'depth' as const } };
    expect(resolveReviewSpatialFocusGeometry(frontal)).toMatchObject({
      flat: true,
      sharp: [],
      soft: [],
      handles: [],
    });
    expect(reviewSpatialFocusPatch(frontal, 'width', center)).toBeNull();
    const angle = Math.PI / 360;
    const shallow: ReviewSpatialControlGeometryInput = {
      ...frontal,
      rotation: [0, Math.sin(angle), 0, Math.cos(angle)],
    };
    expect(resolveReviewSpatialFocusGeometry(shallow)).toMatchObject({
      flat: false,
      sharp: [],
      soft: [],
      handles: [],
    });
  });
});

describe('strict focus editing', () => {
  it('maps the same canonical output point without CSS/DPR state and changes only requested fields', () => {
    const source = tilted(1440, 820);
    const p = { x: source.plane.x + 1440 * 0.2, y: source.plane.y + 820 * 0.7 };
    const output = projectQuickEditPoint(source.projection, p)!;
    expect(reviewSpatialFocusPatch(source, 'center', output)).toEqual({
      x: expect.closeTo(0.2, 8),
      y: expect.closeTo(0.7, 8),
    });
    expect(reviewSpatialFocusPatch(input, 'center', { x: -100, y: 1000 })).toEqual({ x: 0, y: 1 });
    expect(reviewSpatialFocusPatch(input, 'width', { x: 10000, y: 10000 })).toEqual({ width: 1 });
    expect(reviewSpatialFocusPatch(input, 'softness', center)).toEqual({ softness: 0.01 });
    expect(reviewSpatialFocusPatch(input, 'softness', { x: 10000, y: 10000 })).toEqual({
      softness: 1,
    });
  });

  it('supports a zero-width sharp contour without NaN or accidental strength changes', () => {
    const source = { ...input, focus: { ...input.focus, width: 0 } };
    const geometry = resolveReviewSpatialFocusGeometry(source)!;
    expect(geometry.sharp).toEqual([[center]]);
    expect(reviewSpatialFocusPatch(source, 'width', center)).toEqual({ width: 0 });
  });

  it.each<QuickEditHomography>([
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [NaN, 0, 0, 0, 1, 0, 0, 0, 1],
    [1, 0, 0, 0, Infinity, 0, 0, 0, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, -1],
  ])('rejects invalid or behind-camera projection %# without fallback', (...projection) => {
    expect(unprojectReviewSpatialPoint(projection, center)).toBeNull();
    expect(resolveReviewSpatialFocusGeometry({ ...input, projection })).toBeNull();
    expect(reviewSpatialFocusPatch({ ...input, projection }, 'center', center)).toBeNull();
  });

  it('rejects invalid point, plane, rotation and settings before publishing geometry or patch', () => {
    expect(unprojectReviewSpatialPoint(identity, { x: NaN, y: 0 })).toBeNull();
    expect(
      unprojectReviewSpatialPoint([1e308, 0, 0, 0, 1, 0, 0, 0, 1], { x: Infinity, y: 0 })
    ).toBeNull();
    expect(
      resolveReviewSpatialFocusGeometry({ ...input, plane: { ...input.plane, width: 0 } })
    ).toBeNull();
    expect(resolveReviewSpatialFocusGeometry({ ...input, rotation: [0, 0, 0, NaN] })).toBeNull();
    expect(
      resolveReviewSpatialFocusGeometry({ ...input, focus: { ...input.focus, softness: -1 } })
    ).toBeNull();
    expect(reviewSpatialFocusPatch(input, 'width', { x: NaN, y: 0 })).toBeNull();
  });
});
