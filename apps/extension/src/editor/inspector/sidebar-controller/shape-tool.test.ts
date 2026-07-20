import { describe, expect, it } from 'vitest';

import { resolveSidebarShapeTool } from './';

describe('resolveSidebarShapeTool', () => {
  it('maps highlighted tools to their shape settings owner', () => {
    expect(resolveSidebarShapeTool('ellipse')).toBe('ellipse');
    expect(resolveSidebarShapeTool('diamond')).toBe('diamond');
    expect(resolveSidebarShapeTool('select')).toBe('rectangle');
  });
});
