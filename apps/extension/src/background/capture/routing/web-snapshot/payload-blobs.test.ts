import { beforeEach, expect, it, vi } from 'vitest';

import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
  type WebSnapshotSaveToGalleryPayload,
} from '@sniptale/runtime-contracts/web-snapshot';
import {
  consumeWebSnapshotStagedBlob,
  releaseWebSnapshotStagedBlobs,
  resetWebSnapshotStagedBlobsForTests,
  stageWebSnapshotBlobChunk,
} from './staged-blobs';
import { resolveWebSnapshotPayloadBlobs } from './payload-blobs';

function createManifest(): WebSnapshotManifest {
  return {
    captureMode: WebSnapshotCaptureMode.ReadOnlyNoScripts,
    capturedAt: '2026-05-12T00:00:00.000Z',
    id: 'snapshot-1',
    paths: {
      computedStyles: 'logs/css/computed-styles.json',
      domSnapshot: 'logs/dom.html',
      errors: 'logs/errors.log',
      manifest: 'manifest.json',
      screenshot: 'page-screenshot.png',
      snapshotHtml: 'snapshot/index.html',
      stylesheets: 'logs/css/stylesheets.json',
      virtualDomSnapshot: 'logs/virtual-dom.html',
    },
    schemaVersion: 1,
    source: { faviconUrl: null, title: 'Example', url: 'https://example.test' },
    stats: { assetCount: 0, failedAssetCount: 0, packageSize: 0 },
    warnings: [],
  };
}

function createPayload(): WebSnapshotSaveToGalleryPayload {
  return {
    manifest: createManifest(),
    packageStagedBlobId: 'stage-package-1',
    screenshotMimeType: 'image/png',
    screenshotStagedBlobId: 'stage-screenshot-1',
    snapshotSessionId: 'snapshot-session-1',
  };
}

function stagePayloadBlobs(tabId: number): void {
  stageWebSnapshotBlobChunk({
    base64: Buffer.from('zip').toString('base64'),
    chunkIndex: 0,
    kind: 'package',
    snapshotSessionId: 'snapshot-session-1',
    stagedBlobId: 'stage-package-1',
    tabId,
    totalBytes: 3,
    totalChunks: 1,
  });
  stageWebSnapshotBlobChunk({
    base64: Buffer.from('png').toString('base64'),
    chunkIndex: 0,
    kind: 'screenshot',
    snapshotSessionId: 'snapshot-session-1',
    stagedBlobId: 'stage-screenshot-1',
    tabId,
    totalBytes: 3,
    totalChunks: 1,
  });
}

function stageScreenshotBlobForOwner(args: { snapshotSessionId: string; tabId: number }): void {
  stageWebSnapshotBlobChunk({
    base64: Buffer.from('png').toString('base64'),
    chunkIndex: 0,
    kind: 'screenshot',
    snapshotSessionId: args.snapshotSessionId,
    stagedBlobId: 'stage-screenshot-1',
    tabId: args.tabId,
    totalBytes: 3,
    totalChunks: 1,
  });
}

beforeEach(() => {
  resetWebSnapshotStagedBlobsForTests();
  vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('binary'));
});

it('requires a tab-bound staged web snapshot transfer', () => {
  stagePayloadBlobs(42);

  expect(() => resolveWebSnapshotPayloadBlobs(createPayload(), undefined)).toThrow(
    'Web snapshot payload transfer is invalid'
  );
});

it('resolves staged package and screenshot blobs for the owning tab', async () => {
  stagePayloadBlobs(42);

  const { packageBlob, screenshotBlob } = resolveWebSnapshotPayloadBlobs(createPayload(), 42);

  await expect(packageBlob.text()).resolves.toBe('zip');
  await expect(screenshotBlob.text()).resolves.toBe('png');
  expect(packageBlob.type).toBe('application/x-sniptale-web-snapshot+zip');
  expect(screenshotBlob.type).toBe('image/png');
});

it('rejects staged web snapshot blobs owned by another tab', () => {
  stagePayloadBlobs(7);

  expect(() => resolveWebSnapshotPayloadBlobs(createPayload(), 42)).toThrow(
    'Web snapshot staged payload is missing or incomplete'
  );
});

it('preserves wrong-owner staged refs when mixed payload rollback releases current owner', async () => {
  stageWebSnapshotBlobChunk({
    base64: Buffer.from('zip').toString('base64'),
    chunkIndex: 0,
    kind: 'package',
    snapshotSessionId: 'snapshot-session-1',
    stagedBlobId: 'stage-package-1',
    tabId: 42,
    totalBytes: 3,
    totalChunks: 1,
  });
  stageScreenshotBlobForOwner({ snapshotSessionId: 'snapshot-session-2', tabId: 7 });

  const payload = createPayload();
  expect(() => resolveWebSnapshotPayloadBlobs(payload, 42)).toThrow(
    'Web snapshot staged payload is missing or incomplete'
  );
  releaseWebSnapshotStagedBlobs({ ...payload, tabId: 42 });

  const screenshotBlob = consumeWebSnapshotStagedBlob({
    expectedKind: 'screenshot',
    snapshotSessionId: 'snapshot-session-2',
    stagedBlobId: 'stage-screenshot-1',
    tabId: 7,
    type: 'image/png',
  });

  await expect(screenshotBlob.text()).resolves.toBe('png');
});
