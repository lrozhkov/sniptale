import { expect, it } from 'vitest';

import { buildDynamicShaftOutlinePath, buildShaftOutlinePath } from './shaft-outline';

it('builds static and dynamic shaft outlines through role-local outline ownership', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
  ];
  const staticPath = buildShaftOutlinePath(points, 6);
  const dynamicPath = buildDynamicShaftOutlinePath(points, 6);

  expect(staticPath).toContain('Z');
  expect(dynamicPath).toContain('Z');
  expect(dynamicPath).not.toBe(staticPath);
  expect(buildShaftOutlinePath([{ x: 1, y: 2 }], 6)).not.toContain('NaN');
});

it('builds miter joins and long-miter fallbacks through shaft outline ownership', () => {
  const miterPath = buildShaftOutlinePath(
    [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
    ],
    8
  );
  const fallbackPath = buildShaftOutlinePath(
    [
      { x: 0, y: 20 },
      { x: 20, y: 0 },
      { x: 40, y: 20 },
    ],
    18
  );

  expect(miterPath).toContain('L 16 4');
  expect(fallbackPath).toContain('Z');
  expect(fallbackPath).not.toContain('NaN');
});
