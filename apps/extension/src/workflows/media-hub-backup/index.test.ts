import { expect, it } from 'vitest';

import {
  exportMediaHubBackup as exportMediaHubBackupImpl,
  importMediaHubBackup as importMediaHubBackupImpl,
  inspectLocalMediaHubBackup as inspectLocalMediaHubBackupImpl,
  inspectMediaHubBackup as inspectMediaHubBackupImpl,
} from './v6/public';
import {
  exportMediaHubBackup,
  importMediaHubBackup,
  inspectLocalMediaHubBackup,
  inspectMediaHubBackup,
} from './index';

it('keeps the stable media hub backup facade exports on the root import path', () => {
  expect(exportMediaHubBackup).toBe(exportMediaHubBackupImpl);
  expect(importMediaHubBackup).toBe(importMediaHubBackupImpl);
  expect(inspectLocalMediaHubBackup).toBe(inspectLocalMediaHubBackupImpl);
  expect(inspectMediaHubBackup).toBe(inspectMediaHubBackupImpl);
});
