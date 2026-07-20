import { expect, it } from 'vitest';

import { resolveSidebarShapeTool } from './';

it('maps sidebar highlight tools onto shape settings owners', () => {
  expect(resolveSidebarShapeTool('ellipse')).toBe('ellipse');
  expect(resolveSidebarShapeTool('diamond')).toBe('diamond');
  expect(resolveSidebarShapeTool('arrow')).toBe('rectangle');
});
