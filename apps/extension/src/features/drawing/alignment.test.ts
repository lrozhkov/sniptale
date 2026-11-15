import { expect, it } from 'vitest';
import type { DrawingSnapRelation } from './alignment-relations';
import {
  resolveDrawingAlignmentFeedback,
  type DrawingAlignmentGuide,
  type DrawingAlignmentTarget,
} from './alignment';
const target: DrawingAlignmentTarget = {
  id: 'target',
  kind: 'dom',
  showBounds: true,
  bounds: { x: 50, y: 50, width: 100, height: 100 },
};

const gapRelation: DrawingSnapRelation = {
  kind: 'gap',
  mode: 'repeat',
  axis: 'x',
  key: 'repeated-gap',
  value: 20,
  spans: [
    { from: { x: 20, y: 10 }, to: { x: 40, y: 10 }, participantIds: ['A', 'B'] },
    { from: { x: 70, y: 10 }, to: { x: 90, y: 10 }, participantIds: ['B', 'S'] },
  ],
};

it('projects relation-only measurements without inventing coordinate lines or center diamonds', () => {
  const result = resolveDrawingAlignmentFeedback([], 1, [gapRelation]);
  expect(result.lines).toEqual([]);
  expect(result.markers).toEqual([]);
  expect(result.brackets).toEqual([]);
  expect(result.measurements).toHaveLength(2);
  for (const measurement of result.measurements) {
    expect(measurement.kind).toBe('gap');
    expect(measurement.value).toBe(20);
    expect(measurement.segments).toHaveLength(3);
    expect(measurement.label?.text).toBe('20');
  }
});

it.each([0.25, 1, 2])(
  'keeps measurement caps and dimension clearance fixed on screen at scale %s',
  (scale) => {
    const relation: DrawingSnapRelation = {
      kind: 'dimension',
      dimension: 'width',
      key: 'width',
      value: 80,
      sourceSpan: { from: { x: 0, y: 20 }, to: { x: 80, y: 20 }, participantIds: ['S'] },
      targetSpans: [{ from: { x: 100, y: 50 }, to: { x: 180, y: 50 }, participantIds: ['T'] }],
    };
    const result = resolveDrawingAlignmentFeedback([], scale, [relation]);
    const source = result.measurements.find((item) => item.segments[0]![0]!.x === 0)!;
    expect((source.segments[0]![0]!.y - 20) * scale).toBeCloseTo(-20);
    const cap = source.segments[1]!;
    expect(Math.hypot(cap[1]!.x - cap[0]!.x, cap[1]!.y - cap[0]!.y) * scale).toBeCloseTo(6);
    expect(source.label?.anchor).toBe('middle');
  }
);

it('places height measurements outside the left edge', () => {
  const relation: DrawingSnapRelation = {
    kind: 'dimension',
    dimension: 'height',
    key: 'height',
    value: 80,
    sourceSpan: { from: { x: 30, y: 20 }, to: { x: 30, y: 100 }, participantIds: ['S'] },
    targetSpans: [],
  };
  const measurement = resolveDrawingAlignmentFeedback([], 1, [relation]).measurements[0]!;
  expect(measurement.segments[0]).toEqual([
    { x: 10, y: 20 },
    { x: 10, y: 100 },
  ]);
  expect(measurement.label?.anchor).toBe('end');
});

it('deduplicates real participant spans across matching relation witnesses', () => {
  const overlapping: DrawingSnapRelation = { ...gapRelation, key: 'same-chain', mode: 'center' };
  const first = resolveDrawingAlignmentFeedback([], 1, [gapRelation, overlapping]);
  const reversed = resolveDrawingAlignmentFeedback([], 1, [overlapping, gapRelation]);
  expect(first.measurements).toHaveLength(2);
  expect(reversed.measurements).toEqual(first.measurements);
});

it('keeps tiny intervals measurable without painting an oversized numeric label', () => {
  const relation: DrawingSnapRelation = {
    ...gapRelation,
    value: 2,
    spans: [{ from: { x: 20, y: 10 }, to: { x: 22, y: 10 }, participantIds: ['A', 'S'] }],
  };
  const result = resolveDrawingAlignmentFeedback([], 1, [relation]);
  expect(result.measurements).toHaveLength(1);
  expect(result.measurements[0]!.segments).toHaveLength(3);
  expect(result.measurements[0]!.label).toBeNull();
});
function guide(axis: 'x' | 'y', source = { x: 100, y: 200 }, id = 'target'): DrawingAlignmentGuide {
  return {
    axis,
    coordinate: 100,
    from: 40,
    to: 230,
    points: [],
    matches: [
      {
        target: { ...target, id },
        source: { kind: 'center', point: source },
        anchor: { kind: 'center', point: { x: 100, y: 100 } },
      },
    ],
  };
}
it('keeps target center hollow for a single axis and geometrically gaps the guide', () => {
  const feedback = resolveDrawingAlignmentFeedback([guide('x')]);
  expect(feedback.markers).toEqual([{ x: 100, y: 100, filled: false }]);
  expect(feedback.lines.map((line) => [line.from, line.to])).toEqual([
    [40, 94],
    [106, 230],
  ]);
  expect(feedback.brackets).toHaveLength(2);
});
it('fills exactly one common center only after both axes of the same target agree', () => {
  const feedback = resolveDrawingAlignmentFeedback([
    guide('x', { x: 100, y: 100 }),
    guide('y', { x: 100, y: 100 }),
  ]);
  expect(feedback.markers).toEqual([{ x: 100, y: 100, filled: true }]);
  expect(feedback.lines).toHaveLength(4);
  expect(feedback.brackets).toHaveLength(4);
});
it('does not invent a filled center when different targets supply crossing axes', () => {
  const feedback = resolveDrawingAlignmentFeedback([
    guide('x', { x: 100, y: 100 }, 'left'),
    guide('y', { x: 100, y: 100 }, 'right'),
  ]);
  expect(feedback.markers.every((marker) => !marker.filled)).toBe(true);
});
it('does not fill one target with different accepted anchor points on each axis', () => {
  const x = guide('x', { x: 100, y: 100 });
  const y = guide('y', { x: 100, y: 100 });
  y.matches = [
    {
      target,
      source: { kind: 'point', point: { x: 120, y: 100 } },
      anchor: { kind: 'point', point: { x: 120, y: 100 } },
    },
  ];
  expect(resolveDrawingAlignmentFeedback([x, y]).markers.every((marker) => !marker.filled)).toBe(
    true
  );
});
it.each([0.25, 1, 2])('keeps marker gaps in screen pixels at scale %s', (scale) => {
  const result = resolveDrawingAlignmentFeedback([guide('x')], scale);
  expect((100 - result.lines[0]!.to) * scale).toBeCloseTo(6);
  expect((result.lines[1]!.from - 100) * scale).toBeCloseTo(6);
});
it('merges identical accepted axes without stacking lines and retains separate target markers', () => {
  const one = guide('x');
  const two = guide('x', { x: 100, y: 200 }, 'other');
  two.matches = [
    {
      target: { ...target, id: 'other' },
      source: { kind: 'center', point: { x: 100, y: 200 } },
      anchor: { kind: 'center', point: { x: 100, y: 150 } },
    },
  ];
  expect(resolveDrawingAlignmentFeedback([one, two]).lines).toHaveLength(3);
  expect(resolveDrawingAlignmentFeedback([one, two]).markers).toHaveLength(2);
});

it('does not turn exact edge-corner correspondence into a filled center marker', () => {
  const edge = { kind: 'edge' as const, point: { x: 50, y: 50 } };
  const point = { kind: 'point' as const, point: { x: 50, y: 50 } };
  const guides: DrawingAlignmentGuide[] = (['x', 'y'] as const).map((axis) => ({
    axis,
    coordinate: 50,
    from: 40,
    to: 230,
    points: [],
    matches: [{ target, source: edge, anchor: point }],
  }));
  expect(resolveDrawingAlignmentFeedback(guides).markers).toEqual([]);
});
