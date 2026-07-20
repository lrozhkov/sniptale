import { expect, it, vi } from 'vitest';

import { usePermissionRequests } from '.';

it('reexports the request hook', () => {
  expect(usePermissionRequests).toBeTypeOf('function');
  expect(vi.isMockFunction(usePermissionRequests)).toBe(false);
});
