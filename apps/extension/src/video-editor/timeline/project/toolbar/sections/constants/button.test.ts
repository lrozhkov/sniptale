import { expect, it } from 'vitest';

import { toolbarButtonClassName, toolbarIconButtonClassName } from './button';

it('keeps the toolbar button class stable', () => {
  expect(toolbarButtonClassName).toContain('!w-auto');
  expect(toolbarButtonClassName).toContain('!px-2.5');
  expect(toolbarIconButtonClassName).toContain('!px-0');
});
