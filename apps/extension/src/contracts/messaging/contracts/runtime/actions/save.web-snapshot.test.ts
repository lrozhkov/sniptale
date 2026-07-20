import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createWebSnapshotManifest } from '../../../../../features/web-snapshot/manifest';
import {
  runtimeActionWebSnapshotSaveMessageContracts,
  WEB_SNAPSHOT_MAX_ASSET_URL_LENGTH,
  WEB_SNAPSHOT_MAX_ASSET_URLS,
  WEB_SNAPSHOT_MAX_STAGE_CHUNK_BASE64_LENGTH,
  WEB_SNAPSHOT_MAX_SESSION_ID_LENGTH,
} from './save.web-snapshot.ts';

function createWebSnapshotSaveRequest() {
  return {
    manifest: createWebSnapshotManifest({
      id: 'snapshot-1',
      source: { faviconUrl: null, title: 'Example', url: 'https://example.com' },
    }),
    packageStagedBlobId: 'stage-package-1',
    screenshotMimeType: 'image/png',
    screenshotStagedBlobId: 'stage-screenshot-1',
    snapshotSessionId: 'snapshot-session-1',
    type: MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY,
  };
}

it('parses web snapshot gallery save runtime messages and responses', () => {
  const contract =
    runtimeActionWebSnapshotSaveMessageContracts[MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY];
  const request = createWebSnapshotSaveRequest();

  expect(contract.parseRequest(request)).toEqual(request);
  expect(contract.parseResponse({ success: true, assetId: 'asset-1' })).toEqual({
    success: true,
    assetId: 'asset-1',
  });
  expect(() => contract.parseRequest({ ...request, manifest: { id: 'snapshot-1' } })).toThrow(
    'runtime SAVE_WEB_SNAPSHOT_TO_GALLERY message'
  );
});

it('rejects direct web snapshot gallery save transfers', () => {
  const contract =
    runtimeActionWebSnapshotSaveMessageContracts[MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY];
  const request = createWebSnapshotSaveRequest();

  expect(() => contract.parseRequest({ ...request, packageBase64: 'emlw' })).toThrow(
    'runtime SAVE_WEB_SNAPSHOT_TO_GALLERY message'
  );
  expect(() => contract.parseRequest({ ...request, screenshotBase64: 'cG5n' })).toThrow(
    'runtime SAVE_WEB_SNAPSHOT_TO_GALLERY message'
  );
  expect(() => {
    const { packageStagedBlobId: _packageStagedBlobId, ...missingPackage } = request;
    contract.parseRequest(missingPackage);
  }).toThrow('runtime SAVE_WEB_SNAPSHOT_TO_GALLERY message');
});

it('rejects oversized or malformed web snapshot gallery save payloads', () => {
  const contract =
    runtimeActionWebSnapshotSaveMessageContracts[MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY];
  const request = createWebSnapshotSaveRequest();

  expect(() => contract.parseRequest({ ...request, screenshotMimeType: 'text/html' })).toThrow(
    'runtime SAVE_WEB_SNAPSHOT_TO_GALLERY message'
  );
  expect(() =>
    contract.parseRequest({
      ...request,
      snapshotSessionId: 'x'.repeat(WEB_SNAPSHOT_MAX_SESSION_ID_LENGTH + 1),
    })
  ).toThrow('runtime SAVE_WEB_SNAPSHOT_TO_GALLERY message');
});

it('parses staged web snapshot blob chunk messages and responses', () => {
  const contract =
    runtimeActionWebSnapshotSaveMessageContracts[MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK];
  const request = {
    base64: 'emlw',
    blobKind: 'package',
    chunkIndex: 0,
    snapshotSessionId: 'snapshot-session-1',
    stagedBlobId: 'stage-package-1',
    totalBytes: 3,
    totalChunks: 1,
    type: MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK,
  };

  expect(contract.parseRequest(request)).toEqual(request);
  expect(
    contract.parseResponse({ success: true, complete: true, stagedBlobId: 'stage-package-1' })
  ).toEqual({
    complete: true,
    stagedBlobId: 'stage-package-1',
    success: true,
  });
  expect(() => contract.parseRequest({ ...request, blobKind: 'archive' })).toThrow(
    'runtime STAGE_WEB_SNAPSHOT_BLOB_CHUNK message'
  );
  expect(() => contract.parseRequest({ ...request, chunkIndex: 1, totalChunks: 1 })).toThrow(
    'runtime STAGE_WEB_SNAPSHOT_BLOB_CHUNK message'
  );
  expect(() =>
    contract.parseRequest({
      ...request,
      base64: 'A'.repeat(WEB_SNAPSHOT_MAX_STAGE_CHUNK_BASE64_LENGTH + 1),
    })
  ).toThrow('runtime STAGE_WEB_SNAPSHOT_BLOB_CHUNK message');
});

it('parses registered web snapshot asset fetch messages and responses', () => {
  const fetchContract =
    runtimeActionWebSnapshotSaveMessageContracts[MessageType.FETCH_WEB_SNAPSHOT_ASSET];
  const registerContract =
    runtimeActionWebSnapshotSaveMessageContracts[MessageType.REGISTER_WEB_SNAPSHOT_ASSETS];

  expect(
    fetchContract.parseRequest({
      snapshotSessionId: 'snapshot-session-1',
      type: MessageType.FETCH_WEB_SNAPSHOT_ASSET,
      url: 'https://upload.wikimedia.org/example.svg',
    })
  ).toEqual({
    snapshotSessionId: 'snapshot-session-1',
    type: MessageType.FETCH_WEB_SNAPSHOT_ASSET,
    url: 'https://upload.wikimedia.org/example.svg',
  });
  expect(() =>
    registerContract.parseRequest({
      assetUrls: Array.from({ length: WEB_SNAPSHOT_MAX_ASSET_URLS + 1 }, (_, index) => {
        return `https://cdn.example.com/${index}.png`;
      }),
      requestId: 'req-web',
      type: MessageType.REGISTER_WEB_SNAPSHOT_ASSETS,
    })
  ).toThrow('runtime REGISTER_WEB_SNAPSHOT_ASSETS message');
  expect(() =>
    fetchContract.parseRequest({
      snapshotSessionId: 'snapshot-session-1',
      type: MessageType.FETCH_WEB_SNAPSHOT_ASSET,
      url: `https://cdn.example.com/${'a'.repeat(WEB_SNAPSHOT_MAX_ASSET_URL_LENGTH)}`,
    })
  ).toThrow('runtime FETCH_WEB_SNAPSHOT_ASSET message');
});
