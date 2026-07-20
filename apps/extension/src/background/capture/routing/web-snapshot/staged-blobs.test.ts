import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  consumeWebSnapshotStagedBlob,
  resetWebSnapshotStagedBlobsForTests,
  releaseWebSnapshotStagedBlobs,
  stageWebSnapshotBlobChunk,
} from './staged-blobs';

const packageStageId = 'stage-package-test';
const screenshotStageId = 'stage-screenshot-test';

type StageChunkArgs = Parameters<typeof stageWebSnapshotBlobChunk>[0];

function encode(value: string): string {
  return Buffer.from(value).toString('base64');
}

function stageChunk(overrides: Partial<StageChunkArgs> = {}) {
  return stageWebSnapshotBlobChunk({
    base64: encode('x'),
    chunkIndex: 0,
    kind: 'package',
    snapshotSessionId: 'snapshot-session-1',
    stagedBlobId: packageStageId,
    tabId: 42,
    totalBytes: 1,
    totalChunks: 1,
    ...overrides,
  });
}

beforeEach(() => {
  resetWebSnapshotStagedBlobsForTests();
  vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('binary'));
});

afterEach(() => {
  resetWebSnapshotStagedBlobsForTests();
  releaseWebSnapshotStagedBlobs({
    packageStagedBlobId: packageStageId,
    screenshotStagedBlobId: screenshotStageId,
    snapshotSessionId: 'snapshot-session-1',
    tabId: 42,
  });
  vi.unstubAllGlobals();
});

it('stages chunks and materializes a tab-bound web snapshot blob', async () => {
  const result = stageWebSnapshotBlobChunk({
    base64: encode('zip'),
    chunkIndex: 0,
    kind: 'package',
    snapshotSessionId: 'snapshot-session-1',
    stagedBlobId: packageStageId,
    tabId: 42,
    totalBytes: 3,
    totalChunks: 1,
  });

  const blob = consumeWebSnapshotStagedBlob({
    expectedKind: 'package',
    snapshotSessionId: 'snapshot-session-1',
    stagedBlobId: packageStageId,
    tabId: 42,
    type: 'application/x-sniptale-web-snapshot+zip',
  });

  expect(result).toEqual({ complete: true, stagedBlobId: packageStageId });
  expect(blob.type).toBe('application/x-sniptale-web-snapshot+zip');
  expect(await blob.text()).toBe('zip');
});

it('rejects duplicate or changed staged chunk metadata', () => {
  const chunk = {
    base64: encode('png'),
    chunkIndex: 0,
    kind: 'screenshot' as const,
    snapshotSessionId: 'snapshot-session-1',
    stagedBlobId: screenshotStageId,
    tabId: 42,
    totalBytes: 3,
    totalChunks: 1,
  };

  stageWebSnapshotBlobChunk(chunk);

  expect(() => stageWebSnapshotBlobChunk(chunk)).toThrow(
    'Web snapshot staged payload chunk was already received'
  );
  expect(() => stageWebSnapshotBlobChunk({ ...chunk, tabId: 43 })).toThrow(
    'Web snapshot staged payload metadata changed'
  );
});

it('rejects incomplete staged blobs and releases their reservation', async () => {
  stageChunk({ base64: encode('zip'), totalBytes: 6, totalChunks: 2 });

  expect(() =>
    consumeWebSnapshotStagedBlob({
      expectedKind: 'package',
      snapshotSessionId: 'snapshot-session-1',
      stagedBlobId: packageStageId,
      tabId: 42,
      type: 'application/x-sniptale-web-snapshot+zip',
    })
  ).toThrow('Web snapshot staged payload is missing or incomplete');

  stageChunk({ base64: encode('zip'), totalBytes: 3 });
  const blob = consumeWebSnapshotStagedBlob({
    expectedKind: 'package',
    snapshotSessionId: 'snapshot-session-1',
    stagedBlobId: packageStageId,
    tabId: 42,
    type: 'application/x-sniptale-web-snapshot+zip',
  });

  await expect(blob.text()).resolves.toBe('zip');
});

it('rejects wrong-owner staged blobs without releasing the owning tab payload', async () => {
  stageChunk({ base64: encode('zip'), totalBytes: 3 });

  expect(() =>
    consumeWebSnapshotStagedBlob({
      expectedKind: 'package',
      snapshotSessionId: 'snapshot-session-1',
      stagedBlobId: packageStageId,
      tabId: 7,
      type: 'application/x-sniptale-web-snapshot+zip',
    })
  ).toThrow('Web snapshot staged payload is missing or incomplete');

  const blob = consumeWebSnapshotStagedBlob({
    expectedKind: 'package',
    snapshotSessionId: 'snapshot-session-1',
    stagedBlobId: packageStageId,
    tabId: 42,
    type: 'application/x-sniptale-web-snapshot+zip',
  });

  await expect(blob.text()).resolves.toBe('zip');
});

it('fails closed when restart clears staged payload authority', () => {
  const stagedBlobId = 'stage-restart-test';
  stageWebSnapshotBlobChunk({
    base64: encode('restart'),
    chunkIndex: 0,
    kind: 'package',
    snapshotSessionId: 'snapshot-session-1',
    stagedBlobId,
    tabId: 42,
    totalBytes: 7,
    totalChunks: 1,
  });

  resetWebSnapshotStagedBlobsForTests();

  expect(() =>
    consumeWebSnapshotStagedBlob({
      expectedKind: 'package',
      snapshotSessionId: 'snapshot-session-1',
      stagedBlobId,
      tabId: 42,
      type: 'application/x-sniptale-web-snapshot+zip',
    })
  ).toThrow('Web snapshot staged payload is missing or incomplete');
});

it('rejects staged chunks that exceed package budgets', () => {
  expect(() =>
    stageWebSnapshotBlobChunk({
      base64: encode('zip'),
      chunkIndex: 0,
      kind: 'package',
      snapshotSessionId: 'snapshot-session-1',
      stagedBlobId: packageStageId,
      tabId: 42,
      totalBytes: 100 * 1024 * 1024 + 1,
      totalChunks: 1,
    })
  ).toThrow('Web snapshot staged payload metadata is invalid');
});

it('rejects staged payload reservations above the aggregate runtime budget', () => {
  const maxPackageBytes = 100 * 1024 * 1024;
  const maxScreenshotBytes = 25 * 1024 * 1024;

  stageChunk({
    stagedBlobId: 'stage-package-max',
    totalBytes: maxPackageBytes,
    totalChunks: 256,
  });
  stageChunk({
    kind: 'screenshot',
    stagedBlobId: 'stage-screenshot-max',
    totalBytes: maxScreenshotBytes,
    totalChunks: 256,
  });

  expect(() => stageChunk({ stagedBlobId: 'stage-extra' })).toThrow(
    'Web snapshot staged payload aggregate limit exceeded'
  );

  releaseWebSnapshotStagedBlobs({
    packageStagedBlobId: 'stage-package-max',
    snapshotSessionId: 'snapshot-session-1',
    tabId: 42,
  });
  expect(stageChunk({ stagedBlobId: 'stage-extra' })).toEqual({
    complete: true,
    stagedBlobId: 'stage-extra',
  });
});

it('ignores id-only collisions when releasing staged payloads for another owner', async () => {
  stageChunk({
    base64: encode('png'),
    kind: 'screenshot',
    stagedBlobId: screenshotStageId,
    totalBytes: 3,
  });

  releaseWebSnapshotStagedBlobs({
    screenshotStagedBlobId: screenshotStageId,
    snapshotSessionId: 'snapshot-session-2',
    tabId: 7,
  });

  const blob = consumeWebSnapshotStagedBlob({
    expectedKind: 'screenshot',
    snapshotSessionId: 'snapshot-session-1',
    stagedBlobId: screenshotStageId,
    tabId: 42,
    type: 'image/png',
  });

  await expect(blob.text()).resolves.toBe('png');
});

it('rejects staged payload record counts beyond the runtime cap', () => {
  for (let index = 0; index < 32; index += 1) {
    stageChunk({ stagedBlobId: `stage-record-${index}` });
  }

  expect(() => stageChunk({ stagedBlobId: 'stage-record-overflow' })).toThrow(
    'Too many web snapshot staged payloads'
  );
});
