import { Download, Mic } from 'lucide-react';
import { expect, it } from 'vitest';

import { findPermissionById } from './find';
import type { PermissionInfo } from '../../permissions-lib';

it('finds a permission by id or returns null', () => {
  const permissions: PermissionInfo[] = [
    {
      id: 'microphone',
      icon: Mic,
      state: 'prompt',
      type: 'web',
    },
    {
      id: 'downloads',
      icon: Download,
      state: 'prompt',
      type: 'chrome',
      chromePermission: 'downloads',
    },
  ];

  expect(findPermissionById(permissions, 'downloads')).toEqual(permissions[1]);
  expect(findPermissionById(permissions, 'missing')).toBeNull();
});
