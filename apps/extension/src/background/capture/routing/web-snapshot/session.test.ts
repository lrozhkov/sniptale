import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  assertWebSnapshotSessionOpen,
  authorizeWebSnapshotAssetFetch,
  authorizeWebSnapshotCaptureRequest,
  beginWebSnapshotSave,
  cancelWebSnapshotCaptureRequest,
  commitWebSnapshotSave,
  releaseWebSnapshotSave,
  registerWebSnapshotAssetSession,
  resetWebSnapshotAssetSessionsForTests,
} from './session';
import {
  consumeWebSnapshotStagedBlob,
  resetWebSnapshotStagedBlobsForTests,
  stageWebSnapshotBlobChunk,
} from './staged-blobs';

beforeEach(() => {
  resetWebSnapshotAssetSessionsForTests();
  resetWebSnapshotStagedBlobsForTests();
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => 'snapshot-session-1'),
  });
});

afterEach(() => {
  resetWebSnapshotAssetSessionsForTests();
  resetWebSnapshotStagedBlobsForTests();
  vi.unstubAllGlobals();
});

it('requires a background-authorized capture request before asset registration', () => {
  expect(() =>
    registerWebSnapshotAssetSession(42, 'req-1', ['https://cdn.example.com/image.png'])
  ).toThrow('Web snapshot capture request is not authorized');
});

it('retains an early cancellation tombstone so authorization cannot race it', () => {
  expect(cancelWebSnapshotCaptureRequest(42, 'req-cancelled')).toEqual([]);

  expect(() => authorizeWebSnapshotCaptureRequest(42, 'req-cancelled')).toThrow(
    'Web snapshot save was cancelled'
  );
  expect(() => registerWebSnapshotAssetSession(42, 'req-cancelled', [])).toThrow(
    'Web snapshot save was cancelled'
  );
});

it('binds registered asset URLs to the issuing tab session', () => {
  authorizeWebSnapshotCaptureRequest(42, 'req-1', { allowAnonymousCrossOriginAssets: true });
  const sessionId = registerWebSnapshotAssetSession(42, 'req-1', [
    'https://cdn.example.com/image.png',
  ]);

  expect(sessionId).toBe('snapshot-session-1');
  expect(() =>
    authorizeWebSnapshotAssetFetch({
      sessionId,
      tabId: 42,
      url: 'https://cdn.example.com/image.png',
    })
  ).not.toThrow();
});

it('uses crypto random values when randomUUID is unavailable', () => {
  vi.stubGlobal('crypto', {
    getRandomValues: vi.fn((array: Uint8Array) => {
      array.set([
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
        0x0f,
      ]);
      return array;
    }),
  });

  authorizeWebSnapshotCaptureRequest(42, 'req-1', { allowAnonymousCrossOriginAssets: true });
  expect(registerWebSnapshotAssetSession(42, 'req-1', [])).toBe(
    '00010203-0405-4607-8809-0a0b0c0d0e0f'
  );
});

it('rejects unregistered URLs and wrong-tab sessions', () => {
  authorizeWebSnapshotCaptureRequest(42, 'req-1', { allowAnonymousCrossOriginAssets: true });
  const sessionId = registerWebSnapshotAssetSession(42, 'req-1', [
    'https://cdn.example.com/image.png',
  ]);

  expect(() =>
    authorizeWebSnapshotAssetFetch({
      sessionId,
      tabId: 42,
      url: 'https://cdn.example.com/other.png',
    })
  ).toThrow('Web snapshot asset was not registered for this session');
  expect(() =>
    authorizeWebSnapshotAssetFetch({
      sessionId,
      tabId: 43,
      url: 'https://cdn.example.com/image.png',
    })
  ).toThrow('Invalid web snapshot session');
});

it('allows a snapshot save once for the issuing tab', () => {
  authorizeWebSnapshotCaptureRequest(42, 'req-1');
  const sessionId = registerWebSnapshotAssetSession(42, 'req-1', []);

  expect(() => beginWebSnapshotSave({ sessionId, tabId: 42 })).not.toThrow();
  expect(() => beginWebSnapshotSave({ sessionId, tabId: 42 })).toThrow(
    'Web snapshot session save is already in progress'
  );
  expect(() => releaseWebSnapshotSave({ sessionId, tabId: 42 })).not.toThrow();
  expect(() => beginWebSnapshotSave({ sessionId, tabId: 42 })).not.toThrow();
  expect(() => commitWebSnapshotSave({ assetId: 'asset-1', sessionId, tabId: 42 })).not.toThrow();
  expect(() => beginWebSnapshotSave({ sessionId, tabId: 42 })).toThrow(
    'Web snapshot session was already saved'
  );
  expect(() => beginWebSnapshotSave({ sessionId, tabId: 43 })).toThrow(
    'Invalid web snapshot session'
  );
});

it('blocks a pending commit and identifies an already committed asset for compensation', () => {
  authorizeWebSnapshotCaptureRequest(42, 'req-saving');
  const savingSessionId = registerWebSnapshotAssetSession(42, 'req-saving', []);
  beginWebSnapshotSave({ sessionId: savingSessionId, tabId: 42 });
  expect(cancelWebSnapshotCaptureRequest(42, 'req-saving')).toEqual([]);
  expect(() =>
    commitWebSnapshotSave({
      assetId: 'asset-saving',
      sessionId: savingSessionId,
      tabId: 42,
    })
  ).toThrow('Web snapshot save was cancelled');

  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'snapshot-session-2') });
  authorizeWebSnapshotCaptureRequest(42, 'req-saved');
  const savedSessionId = registerWebSnapshotAssetSession(42, 'req-saved', []);
  beginWebSnapshotSave({ sessionId: savedSessionId, tabId: 42 });
  commitWebSnapshotSave({ assetId: 'asset-saved', sessionId: savedSessionId, tabId: 42 });
  expect(cancelWebSnapshotCaptureRequest(42, 'req-saved')).toEqual(['asset-saved']);
});

it('releases every complete or partial staged blob owned by a cancelled capture session', () => {
  authorizeWebSnapshotCaptureRequest(42, 'req-staged');
  const sessionId = registerWebSnapshotAssetSession(42, 'req-staged', []);
  stageWebSnapshotBlobChunk({
    base64: 'cG5n',
    chunkIndex: 0,
    kind: 'screenshot',
    snapshotSessionId: sessionId,
    stagedBlobId: 'complete-stage',
    tabId: 42,
    totalBytes: 3,
    totalChunks: 1,
  });
  stageWebSnapshotBlobChunk({
    base64: 'YQ==',
    chunkIndex: 0,
    kind: 'package',
    snapshotSessionId: sessionId,
    stagedBlobId: 'partial-stage',
    tabId: 42,
    totalBytes: 2,
    totalChunks: 2,
  });

  cancelWebSnapshotCaptureRequest(42, 'req-staged');

  expect(() =>
    consumeWebSnapshotStagedBlob({
      expectedKind: 'screenshot',
      snapshotSessionId: sessionId,
      stagedBlobId: 'complete-stage',
      tabId: 42,
      type: 'image/png',
    })
  ).toThrow('missing or incomplete');
  expect(() =>
    consumeWebSnapshotStagedBlob({
      expectedKind: 'package',
      snapshotSessionId: sessionId,
      stagedBlobId: 'partial-stage',
      tabId: 42,
      type: 'application/zip',
    })
  ).toThrow('missing or incomplete');
});

it('exposes an open-session guard for staged snapshot payload allocation', () => {
  authorizeWebSnapshotCaptureRequest(42, 'req-1');
  const sessionId = registerWebSnapshotAssetSession(42, 'req-1', []);

  expect(() => assertWebSnapshotSessionOpen({ sessionId, tabId: 42 })).not.toThrow();
  expect(() => assertWebSnapshotSessionOpen({ sessionId, tabId: 43 })).toThrow(
    'Invalid web snapshot session'
  );
  beginWebSnapshotSave({ sessionId, tabId: 42 });
  expect(() => assertWebSnapshotSessionOpen({ sessionId, tabId: 42 })).toThrow(
    'Web snapshot session is not open'
  );
});

it('rejects oversized asset registration lists', () => {
  authorizeWebSnapshotCaptureRequest(42, 'req-1', { allowAnonymousCrossOriginAssets: true });
  expect(() =>
    registerWebSnapshotAssetSession(
      42,
      'req-1',
      Array.from({ length: 501 }, (_, index) => `https://cdn.example.com/${index}.png`)
    )
  ).toThrow('Too many web snapshot assets');
});

it('rejects external asset registration when anonymous cross-origin capture is disabled', () => {
  authorizeWebSnapshotCaptureRequest(42, 'req-1', {
    allowAnonymousCrossOriginAssets: false,
  });

  expect(() =>
    registerWebSnapshotAssetSession(42, 'req-1', ['https://cdn.example.com/image.png'])
  ).toThrow('anonymous cross-origin asset fetch is disabled');
});
