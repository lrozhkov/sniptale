import { expect, it } from 'vitest';
import {
  buildDrawingArrowOutline,
  buildDrawingFreehandArrowLines,
  resolveDrawingArrowBendTarget,
  updateDrawingArrowBend,
} from './arrow';
import { MAX_DRAWING_ARROW_BENDS } from './model';

function createArrow(dynamicWidth: boolean) {
  return {
    color: '#ef4444',
    dynamicWidth,
    end: { x: 200, y: 0 },
    id: 'arrow',
    kind: 'arrow' as const,
    start: { x: 0, y: 0 },
    width: 18,
  };
}

it('mirrors the editor arrow profile by widening the shaft toward the head', () => {
  const dynamic = buildDrawingArrowOutline(createArrow(true));
  const uniform = buildDrawingArrowOutline(createArrow(false));

  expect(Math.abs(dynamic[0]!.y)).toBeLessThan(Math.abs(dynamic[1]!.y));
  expect(Math.abs(uniform[0]!.y)).toBe(Math.abs(uniform[1]!.y));
  expect(dynamic[3]).toEqual({ x: 200, y: 0 });
});

it('returns finite selectable geometry for a zero-length arrow', () => {
  const outline = buildDrawingArrowOutline({
    ...createArrow(true),
    end: { x: 0, y: 0 },
  });

  expect(outline).toHaveLength(4);
  expect(outline.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
});

it('keeps the freehand arrow ideal geometry canonical and leaves sketching to the renderer', () => {
  const lines = buildDrawingFreehandArrowLines({
    ...createArrow(true),
    design: 'freehand',
  });

  expect(lines).toHaveLength(3);
  expect(lines[0]).toEqual([
    { x: 0, y: 0 },
    { x: 200, y: 0 },
  ]);
  expect(lines[1]).toHaveLength(2);
  expect(lines[2]).toHaveLength(2);
  expect(lines[1]?.at(-1)).toEqual({ x: 200, y: 0 });
  expect(lines[2]?.at(0)).toEqual({ x: 200, y: 0 });
  expect(lines[1]?.at(0)?.x).toBe(lines[2]?.at(-1)?.x);
  expect(lines[1]?.at(0)?.y).toBe(-(lines[2]?.at(-1)?.y ?? 0));
});

it('passes through every authored bend and follows the final tangent at the head', () => {
  const arrow = {
    ...createArrow(false),
    design: 'freehand' as const,
    bendPoints: [
      { x: 60, y: 80 },
      { x: 140, y: 80 },
    ],
  };
  const lines = buildDrawingFreehandArrowLines(arrow);
  expect(lines[0]).toContainEqual(arrow.bendPoints[0]);
  expect(lines[0]).toContainEqual(arrow.bendPoints[1]);
  expect(lines[0]?.[0]).toEqual(arrow.start);
  expect(lines[0]?.at(-1)).toEqual(arrow.end);
  const wing = lines[1]![0]!;
  expect(wing.y).toBeGreaterThan(arrow.end.y);
  expect(lines.flat().every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(
    true
  );
});

it('projects insertion onto the visible shaft, prioritizes vertices, and preserves insertion order', () => {
  const arrow = { ...createArrow(false), design: 'freehand' as const };
  const first = resolveDrawingArrowBendTarget(arrow, { x: 100, y: 6 });
  expect(first).toEqual({ point: { x: 100, y: 0 }, index: 0, insert: true });
  const bent = updateDrawingArrowBend(arrow, first!, { x: 100, y: 80 });
  expect(arrow).not.toHaveProperty('bendPoints');
  expect(resolveDrawingArrowBendTarget(bent, { x: 103, y: 80 })).toEqual({
    point: { x: 100, y: 80 },
    index: 0,
    insert: false,
  });
  const lines = buildDrawingFreehandArrowLines(bent)[0]!;
  const before = resolveDrawingArrowBendTarget(bent, lines[12]!);
  const after = resolveDrawingArrowBendTarget(bent, lines[36]!);
  expect(before).toMatchObject({ index: 0, insert: true });
  expect(after).toMatchObject({ index: 1, insert: true });
  expect(resolveDrawingArrowBendTarget(bent, { x: 100, y: 0 })).toBeNull();
  expect(resolveDrawingArrowBendTarget(bent, arrow.start)).toBeNull();
  expect(resolveDrawingArrowBendTarget(createArrow(true), { x: 100, y: 0 })).toBeNull();
  const second = updateDrawingArrowBend(bent, after!, { x: 160, y: 100 });
  expect(second.bendPoints).toEqual([
    { x: 100, y: 80 },
    { x: 160, y: 100 },
  ]);
  const moved = updateDrawingArrowBend(
    second,
    { point: second.bendPoints![0]!, index: 0, insert: false },
    { x: 80, y: 70 }
  );
  expect(moved.bendPoints).toEqual([
    { x: 80, y: 70 },
    { x: 160, y: 100 },
  ]);
  expect(second.bendPoints).toEqual([
    { x: 100, y: 80 },
    { x: 160, y: 100 },
  ]);
});

it('retains existing bends at the resource ceiling and ignores invalid edit targets', () => {
  const arrow = {
    ...createArrow(false),
    design: 'freehand' as const,
    bendPoints: Array.from({ length: MAX_DRAWING_ARROW_BENDS }, (_, index) => ({
      x: index + 20,
      y: 80,
    })),
  };
  expect(resolveDrawingArrowBendTarget(arrow, { x: 100, y: 0 })).toBeNull();
  expect(resolveDrawingArrowBendTarget(arrow, { x: 20, y: 80 })).toMatchObject({ insert: false });
  expect(
    updateDrawingArrowBend(arrow, { point: arrow.start, index: 0, insert: true }, arrow.end)
  ).toBe(arrow);
  expect(
    updateDrawingArrowBend(arrow, { point: arrow.start, index: -1, insert: false }, arrow.end)
  ).toBe(arrow);
});
