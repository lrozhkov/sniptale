import { expect, it } from 'vitest';
import { evaluateCursorFocusSegment } from './evaluator';
import {
  insertCursorFocusKey,
  updateCursorFocusKey,
  deleteCursorFocusKey,
  authoredCursorFocusPath,
  resolveAuthoredCursorFocusPath,
} from './authoring';
import { parseCursorFocusPath } from './validation';
import type { CursorFocusPath } from './types';
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
