import { expect, it } from 'vitest';

import { exportMediaHubBackup as exportMediaHubBackupImpl } from './export';
import { inspectLocalMediaHubBackup as inspectLocalMediaHubBackupImpl } from './inspect/local';
import { importMediaHubBackup as importMediaHubBackupImpl } from './import';
import { inspectMediaHubBackup as inspectMediaHubBackupImpl } from './inspect';
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
