import { expect, it } from 'vitest';

import * as canonical from '.';
import * as facade from '.';

it('keeps the permissions section root as a thin facade', () => {
  expect(facade.PermissionsSection).toBe(canonical.PermissionsSection);
});
