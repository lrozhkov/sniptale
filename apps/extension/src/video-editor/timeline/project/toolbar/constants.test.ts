import { expect, it } from 'vitest';

import { toolbarButtonClassName, toolbarIconButtonClassName } from './constants';

it('keeps the shared toolbar classes stable', () => {
  expect(toolbarButtonClassName).toContain('!h-9');
  expect(toolbarButtonClassName).toContain('!w-auto');
  expect(toolbarIconButtonClassName).toContain('!w-9');
});
