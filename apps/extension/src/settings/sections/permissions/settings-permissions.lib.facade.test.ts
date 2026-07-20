import { expect, it } from 'vitest';

import * as canonical from './permissions-lib';
import * as facade from './settings-permissions.lib';

it('keeps the permissions-lib root as a thin facade', () => {
  expect(facade.getPermissionContent).toBe(canonical.getPermissionContent);
  expect(facade.readPermissionsSnapshot).toBe(canonical.readPermissionsSnapshot);
});
