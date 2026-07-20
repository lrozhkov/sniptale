// @vitest-environment jsdom

import JSZip from 'jszip';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
} from '@sniptale/runtime-contracts/web-snapshot';
import type { WebSnapshotRecord } from '../../composition/persistence/web-snapshots/contracts';
import { WEB_SNAPSHOT_PACKAGE_PATHS } from '../../features/web-snapshot/manifest';

const NativeURL = URL;

const mocks = vi.hoisted(() => ({
  getWebSnapshotRecord: vi.fn(),
}));

vi.mock('../../composition/persistence/web-snapshots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/web-snapshots')>()),
  getWebSnapshotRecord: mocks.getWebSnapshotRecord,
}));

import { loadWebSnapshotPackage } from './assets';

function createManifest(): WebSnapshotManifest {
  return {
    captureMode: WebSnapshotCaptureMode.ReadOnlyNoScripts,
    capturedAt: '2026-05-12T00:00:00.000Z',
    id: 'snapshot-1',
    paths: WEB_SNAPSHOT_PACKAGE_PATHS,
    schemaVersion: 1,
    source: { faviconUrl: null, title: 'Legacy Snapshot', url: 'https://example.com/page' },
    stats: { assetCount: 0, failedAssetCount: 0, packageSize: 10 },
    warnings: [],
  };
}

async function createPackageBlob(manifest: WebSnapshotManifest): Promise<Blob> {
  const zip = new JSZip();
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest, JSON.stringify(manifest));
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml, '<!doctype html><main>Snapshot</main>');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.screenshot, 'png');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.computedStyles, '{}');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.domSnapshot, '<main>Snapshot</main>');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.errors, '');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.stylesheets, '[]');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.virtualDomSnapshot, '{}');
  zip.file('logs/css/stylesheets/document-stylesheet-01.css', 'body { color: red; }');
  return zip.generateAsync({ type: 'blob' });
}

beforeEach(() => {
  vi.clearAllMocks();
  class MockURL extends NativeURL {}
  Object.defineProperties(MockURL, {
    createObjectURL: { configurable: true, value: vi.fn(() => 'blob:snapshot-asset') },
    revokeObjectURL: { configurable: true, value: vi.fn() },
  });
  vi.stubGlobal('URL', MockURL);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('opens legacy web snapshot packages with stylesheet diagnostic entries', async () => {
  const manifest = createManifest();
  const packageBlob = await createPackageBlob(manifest);
  mocks.getWebSnapshotRecord.mockResolvedValue({
    createdAt: 1,
    id: 'snapshot-1',
    manifest,
    packageBlob,
    size: packageBlob.size,
    updatedAt: 1,
  } satisfies WebSnapshotRecord);

  const loaded = await loadWebSnapshotPackage('snapshot-1');

  expect(loaded.html).toContain('<main>Snapshot</main>');
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
