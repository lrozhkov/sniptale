import { expect, it } from 'vitest';
import { projectMagnetGuides } from './guide-projection';
const target = {
  x: 3,
  y: 4,
  alignment: {
    kind: 'center',
    target: { id: 'target', kind: 'object', bounds: { x: 0, y: 0, width: 6, height: 8 } },
  },
};
const source = {
  anchors: [{ kind: 'point' as const, point: { x: 3, y: 10 } }],
  bounds: { x: 1, y: 2, width: 2, height: 8 },
  screenScale: 1,
};
it('projects accepted resize lines with target identity and ignores malformed vendor entries', () => {
  const vertical = new Set([
    JSON.stringify({ origin: { x: 1, y: 10 }, target }),
    '{bad json',
    JSON.stringify({ origin: { x: 1, y: 2 }, target: { ...target, x: Infinity } }),
  ]);
  const result = projectMagnetGuides(vertical, new Set(), source);
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({
    axis: 'x',
    coordinate: 3,
    matches: [
      {
        target: { id: 'target' },
        source: { point: { x: 3, y: 10 } },
        anchor: { kind: 'center', point: { x: 3, y: 4 } },
      },
    ],
  });
});
it('does not display a guide rejected by final resize constraints', () => {
  const vertical = new Set([JSON.stringify({ origin: { x: 1, y: 10 }, target })]);
  expect(
    projectMagnetGuides(vertical, new Set(), {
      ...source,
      anchors: [{ kind: 'point', point: { x: 8, y: 10 } }],
    })
  ).toEqual([]);
});
it('does not reconstruct a target identity from coincident float coordinates', () => {
  const vertical = new Set([JSON.stringify({ origin: { x: 1, y: 10 }, target: { x: 3, y: 4 } })]);
  expect(projectMagnetGuides(vertical, new Set(), source)).toEqual([]);
});
it('explains mid-edge resize with the same line contract instead of point-only crosses', () => {
  const result = projectMagnetGuides(
    new Set([JSON.stringify({ origin: { x: 1, y: 10 }, target })]),
    new Set(),
    source
  );
  expect(result[0]!.from).toBeLessThan(4);
  expect(result[0]!.to).toBeGreaterThan(10);
});
