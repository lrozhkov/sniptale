import { expect, it } from 'vitest';
import { projectMagnetGuides } from './guide-projection';

it('projects valid guide lines and point-only handles while ignoring malformed vendor entries', () => {
  const vertical = new Set([
    JSON.stringify({ origin: { x: 1, y: 2 }, target: { x: 3, y: 4 } }),
    '{bad json',
    JSON.stringify({ origin: { x: Infinity, y: 0 }, target: { x: 3, y: 4 } }),
  ]);
  const horizontal = new Set([JSON.stringify({ origin: { x: 5, y: 6 }, target: { x: 7, y: 8 } })]);

  expect(projectMagnetGuides(vertical, horizontal, false)).toEqual({
    lines: [
      { origin: { x: 3, y: 2 }, target: { x: 3, y: 4 } },
      { origin: { x: 5, y: 8 }, target: { x: 7, y: 8 } },
    ],
    points: [],
  });
  expect(projectMagnetGuides(vertical, horizontal, true)).toEqual({
    lines: [],
    points: [
      { x: 3, y: 4 },
      { x: 7, y: 8 },
    ],
  });
});
