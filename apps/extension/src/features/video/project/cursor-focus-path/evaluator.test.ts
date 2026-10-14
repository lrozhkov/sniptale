import { expect, it } from 'vitest';
import {
  cursorFocusPreferenceWeight,
  evaluateCursorFocusSegment,
  sampleCursorFocusSegment,
} from './evaluator';
import {
  insertCursorFocusKey,
  updateCursorFocusKey,
  deleteCursorFocusKey,
  authoredCursorFocusPath,
  resolveAuthoredCursorFocusPath,
  simplifyCursorFocusPath,
} from './authoring';
import { parseCursorFocusPath } from './validation';
import type { CursorFocusPath } from './types';

it('weights a manual anchor over its neighboring source-time intervals without adding authoring keys', () => {
  const segment = {
    id: 'weight',
    start: 0,
    end: 2,
    binding: { kind: 'project' as const },
    keys: [
      {
        id: 'a',
        time: 0,
        x: 0.2,
        y: 0.5,
        anchor: 'movement' as const,
        interpolation: 'linear' as const,
      },
      {
        id: 'b',
        time: 1,
        x: 0.6,
        y: 0.5,
        anchor: 'manual' as const,
        interpolation: 'linear' as const,
      },
      {
        id: 'c',
        time: 2,
        x: 0.2,
        y: 0.5,
        anchor: 'movement' as const,
        interpolation: 'linear' as const,
      },
    ],
  };
  const before = structuredClone(segment);
  expect([0, 0.5, 1, 1.5, 2].map((time) => cursorFocusPreferenceWeight(segment, time))).toEqual([
    1, 2.5, 4, 2.5, 1,
  ]);
  expect(segment).toEqual(before);
});
const path: CursorFocusPath = {
  version: 1,
  smoothing: 0.5,
  sensitivity: 0.5,
  mode: 'follow',
  gapPolicy: 'hold',
  segments: [
    {
      id: 'segment',
      binding: { kind: 'project' },
      start: 0,
      end: 2,
      keys: [
        {
          id: 'start',
          time: 0,
          x: 0.1,
          y: 0.1,
          anchor: 'click',
          interpolation: 'smooth',
          outgoing: { x: 0.2, y: 1.8 },
        },
        {
          id: 'end',
          time: 2,
          x: 0.9,
          y: 0.9,
          anchor: 'boundary',
          interpolation: 'smooth',
          incoming: { x: 0.8, y: 1.8 },
        },
      ],
    },
  ],
};
it('preserves manual controls and bounds evaluated curve without rewriting endpoints', () => {
  expect(evaluateCursorFocusSegment(path.segments[0]!, 1)).toMatchObject({
    y: 1,
    constrained: true,
  });
  expect(path.segments[0]!.keys[0]!.outgoing!.y).toBe(1.8);
  expect(evaluateCursorFocusSegment(path.segments[0]!, 3)).toBeNull();
  expect(parseCursorFocusPath(structuredClone(path))).toEqual(path);
});
it('manual time/position authoring preserves captured anchors and reset source facts', () => {
  expect(updateCursorFocusKey(path, 'start', { x: 1, time: 1 }).segments[0]!.keys[0]).toMatchObject(
    { x: 0.1, time: 0 }
  );
  const manual = insertCursorFocusKey(path, 'segment', { id: 'manual', time: 1, x: 0.4, y: 0.5 });
  const updated = updateCursorFocusKey(manual, 'manual', { time: 10, x: -1 });
  expect(updated.segments[0]!.keys.find((key) => key.id === 'manual')).toMatchObject({
    time: 2,
    x: 0,
  });
  expect(deleteCursorFocusKey(manual, 'manual')).toEqual(path);
  expect(deleteCursorFocusKey(path, 'start')).toEqual(path);
});
it('refuses malformed/future and duplicate identities before authoring admission', () => {
  expect(parseCursorFocusPath({ ...path, version: 2 })).toBeNull();
  expect(parseCursorFocusPath({ ...path, smoothing: NaN })).toBeNull();
  expect(
    parseCursorFocusPath({ ...path, segments: [path.segments[0], path.segments[0]] })
  ).toBeNull();
});

it('stores only deliberate overrides and resolves immutable captured anchors from facts', () => {
  expect(
    authoredCursorFocusPath({
      ...path,
      segments: path.segments.map((segment) => ({
        ...segment,
        keys: segment.keys.map(({ incoming: _incoming, outgoing: _outgoing, ...key }) => key),
      })),
    }).segments
  ).toEqual([]);
  const authored = authoredCursorFocusPath(
    updateCursorFocusKey(path, 'start', { outgoing: { x: 1.8, y: 0.4 } })
  );
  const override = authored.segments[0]!.keys[0]!;
  override.x = 0.9;
  override.time = 1;
  const resolved = resolveAuthoredCursorFocusPath(path, authored);
  expect(resolved.segments[0]!.keys.find((key) => key.id === 'start')).toMatchObject({
    x: 0.1,
    time: 0,
    outgoing: { x: 1.8, y: 0.4 },
  });
  const manual = {
    ...path,
    segments: [
      {
        ...path.segments[0]!,
        keys: [
          {
            id: 'manual-only',
            time: 1,
            x: 0.5,
            y: 0.5,
            anchor: 'manual' as const,
            interpolation: 'smooth' as const,
          },
        ],
      },
    ],
  };
  expect(deleteCursorFocusKey(manual, 'manual-only').segments).toEqual([]);
});

it('retains explicit manual keys in observation gaps and before the first retained observation after trim', () => {
  const base: CursorFocusPath = {
    ...path,
    segments: [
      {
        id: 'left',
        binding: { kind: 'project' },
        start: 0,
        end: 1,
        keys: [
          { id: 'left-end', time: 1, x: 0.2, y: 0.2, anchor: 'boundary', interpolation: 'hold' },
        ],
      },
      {
        id: 'right',
        binding: { kind: 'project' },
        start: 3,
        end: 4,
        keys: [
          { id: 'right-start', time: 3, x: 0.8, y: 0.8, anchor: 'boundary', interpolation: 'hold' },
        ],
      },
    ],
  };
  const gap: CursorFocusPath = {
    ...base,
    segments: [
      {
        id: 'explicit-gap',
        binding: { kind: 'project' },
        start: 1,
        end: 3,
        keys: [
          { id: 'gap-key', time: 2, x: 0.4, y: 0.6, anchor: 'manual', interpolation: 'smooth' },
        ],
      },
    ],
  };
  const resolved = resolveAuthoredCursorFocusPath(base, gap);
  expect(
    resolved.segments.flatMap((segment) => segment.keys).find((key) => key.id === 'gap-key')
  ).toMatchObject({ time: 2, x: 0.4, y: 0.6 });
  const trimmed = resolveAuthoredCursorFocusPath(
    { ...base, segments: [base.segments[1]!] },
    { ...gap, segments: [{ ...gap.segments[0]!, start: 0, end: 4 }] }
  );
  expect(
    trimmed.segments.flatMap((segment) => segment.keys).find((key) => key.id === 'gap-key')
  ).toMatchObject({ time: 2, x: 0.4, y: 0.6 });
  expect(parseCursorFocusPath(trimmed)).not.toBeNull();
});

it('uses a coincident manual override for both curve endpoints without moving the recorded anchor', () => {
  const base: CursorFocusPath = {
    ...path,
    segments: [
      {
        ...path.segments[0]!,
        keys: [
          { id: 'left', time: 0, x: 0.1, y: 0.2, anchor: 'boundary', interpolation: 'smooth' },
          { id: 'click', time: 1, x: 0.3, y: 0.4, anchor: 'click', interpolation: 'smooth' },
          { id: 'right', time: 2, x: 0.9, y: 0.8, anchor: 'boundary', interpolation: 'smooth' },
        ],
      },
    ],
  };
  const edited = updateCursorFocusKey(base, 'click', { x: 0.7, y: 0.6 });
  expect(edited.segments[0]!.keys.find((key) => key.anchor === 'manual')).toMatchObject({
    time: 1,
    x: 0.7,
    y: 0.6,
  });
  const segment = edited.segments[0]!;
  expect(evaluateCursorFocusSegment(segment, 1 - 1e-7)?.x).toBeCloseTo(0.7, 5);
  expect(evaluateCursorFocusSegment(segment, 1)).toMatchObject({ x: 0.7, y: 0.6 });
  expect(evaluateCursorFocusSegment(segment, 1 + 1e-7)?.x).toBeCloseTo(0.7, 5);
  expect(segment.keys.find((key) => key.id === 'click')).toEqual(base.segments[0]!.keys[1]);
  const reopened = resolveAuthoredCursorFocusPath(
    base,
    parseCursorFocusPath(authoredCursorFocusPath(edited))!
  );
  for (const time of [0.5, 1 - 1e-7, 1, 1 + 1e-7, 1.5])
    expect(evaluateCursorFocusSegment(reopened.segments[0]!, time)).toEqual(
      evaluateCursorFocusSegment(segment, time)
    );
});

it('reduces 25ms velocity jitter to geometric focus anchors without losing deliberate edits', () => {
  const dense: CursorFocusPath = {
    ...path,
    segments: [
      {
        ...path.segments[0]!,
        keys: Array.from({ length: 81 }, (_, index) => ({
          id: `sample:${index}`,
          time: index * 0.025,
          x: 0.1 + 0.8 * (index / 80) ** 2,
          y: 0.4 + (index % 2 ? 0.0005 : -0.0005),
          anchor: index === 0 || index === 80 ? ('boundary' as const) : ('movement' as const),
          interpolation: 'smooth' as const,
        })),
      },
    ],
  };
  const before = structuredClone(dense);
  expect(simplifyCursorFocusPath(dense).segments[0]!.keys.map((key) => key.id)).toEqual([
    'sample:0',
    'sample:80',
  ]);
  const edited = updateCursorFocusKey(dense, 'sample:40', { outgoing: { x: 0.4, y: 0.8 } });
  const sparse = simplifyCursorFocusPath(edited, 'sample:20');
  expect(sparse.segments[0]!.keys.map((key) => key.id)).toEqual(
    expect.arrayContaining(['sample:0', 'sample:20', 'sample:40', 'sample:80'])
  );
  expect(sparse.segments[0]!.keys.find((key) => key.id === 'sample:40')!.outgoing).toEqual({
    x: 0.4,
    y: 0.8,
  });
  expect(dense).toEqual(before);
});

it('draws a short authored bend and exact key endpoints inside a long segment', () => {
  const segment = {
    ...path.segments[0]!,
    end: 10,
    keys: [
      {
        id: 'start',
        time: 0,
        x: 0.1,
        y: 0.1,
        anchor: 'boundary' as const,
        interpolation: 'smooth' as const,
        outgoing: { x: 0.2, y: 0.9 },
      },
      {
        id: 'turn',
        time: 0.05,
        x: 0.9,
        y: 0.1,
        anchor: 'manual' as const,
        interpolation: 'linear' as const,
        incoming: { x: 0.8, y: 0.9 },
      },
      {
        id: 'end',
        time: 10,
        x: 0.9,
        y: 0.1,
        anchor: 'boundary' as const,
        interpolation: 'linear' as const,
      },
    ],
  };
  const before = structuredClone(segment);
  const points = sampleCursorFocusSegment(segment, 0.5);
  expect(Math.max(...points.map((point) => point.y))).toBeGreaterThan(0.69);
  expect(points).toContainEqual(expect.objectContaining({ x: 0.9, y: 0.1 }));
  expect(points.length).toBeLessThan(257);
  expect(segment).toEqual(before);
});

it('preserves a real reversal along a straight line while removing velocity-only subdivisions', () => {
  const positions = [0.1, 0.4, 0.7, 0.5, 0.3, 0.6, 0.9];
  const returning: CursorFocusPath = {
    ...path,
    segments: [
      {
        ...path.segments[0]!,
        keys: positions.map((x, index) => ({
          id: `turn:${index}`,
          time: index / 3,
          x,
          y: 0.4,
          anchor: index === 0 || index === 6 ? ('boundary' as const) : ('movement' as const),
          interpolation: 'smooth' as const,
        })),
      },
    ],
  };
  expect(simplifyCursorFocusPath(returning).segments[0]!.keys.map((key) => key.id)).toEqual([
    'turn:0',
    'turn:2',
    'turn:4',
    'turn:6',
  ]);
});
