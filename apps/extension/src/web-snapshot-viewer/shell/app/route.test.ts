import { expect, it } from 'vitest';
import { readSnapshotIdFromLocation } from './route';

it('returns null without an ambient window', () => {
  expect(readSnapshotIdFromLocation()).toBeNull();
});

it('reads a trimmed snapshot id from an injected location', () => {
  expect(
    readSnapshotIdFromLocation({
      href: 'chrome-extension://sniptale/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=snapshot-1',
    })
  ).toBe('snapshot-1');
});

it('returns null for missing or blank snapshot ids', () => {
  expect(
    readSnapshotIdFromLocation({
      href: 'chrome-extension://sniptale/apps/extension/src/web-snapshot-viewer/index.html',
    })
  ).toBeNull();
  expect(
    readSnapshotIdFromLocation({
      href: 'chrome-extension://sniptale/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=+',
    })
  ).toBeNull();
});
