import { expect, it } from 'vitest';
import {
  createProjectAssetEntry,
  createVideoProjectEntryWithMediaClip,
} from '../projects/index.test-support';
import { captureRootKey, type CapturedChange, type CapturedVideoProjectRows } from './contracts';
import { parseCapturedVideoProjectRows, parseSyncCaptureRecord } from './guards';
import { collectSyncCaptureClaims } from './claims';

function fixture(): CapturedVideoProjectRows {
  const project = createVideoProjectEntryWithMediaClip();
  const asset = createProjectAssetEntry({
    id: 'project-asset-1',
    mimeType: 'video/webm',
    size: 1024,
  });
  return {
    project,
    assets: [asset],
    exports: [],
    media: [],
    refs: [
      {
        assetId: asset.assetId,
        createdAt: 1,
        location: { kind: 'opfs', objectKey: `objects/${asset.assetId}` },
        mimeType: asset.mimeType,
        size: asset.size,
        sha256: null,
      },
    ],
  };
}
function change(): CapturedChange {
  const rows = fixture();
  return {
    version: 1,
    kind: 'captured-change',
    key: '["change","operation-1"]',
    createdAt: 1,
    spaceId: 'space-1',
    connectionGeneration: 1,
    rootKind: 'video-project',
    rootId: rows.project.id,
    rootKey: captureRootKey('space-1', 'video-project', rows.project.id),
    generation: 1,
    operationId: 'operation-1',
    basis: [],
    origin: 'local-edit',
    publicationId: null,
    change: { kind: 'video-project', rows },
  };
}

it('admits native metadata without placing media bytes in the capture store', () => {
  const rows = fixture();
  expect(parseCapturedVideoProjectRows(rows)).toMatchObject(rows);
});
it('rejects a missing dependency and a contradictory descriptor', () => {
  const rows = fixture();
  rows.refs[0]!.size++;
  expect(parseCapturedVideoProjectRows(rows)).toBeNull();
  rows.refs = [];
  expect(parseCapturedVideoProjectRows(rows)).toBeNull();
});
it('rejects unrelated extra native rows instead of adding arbitrary retention claims', () => {
  const rows = fixture();
  rows.refs.push({
    ...rows.refs[0]!,
    assetId: 'unrelated',
    location: { kind: 'opfs', objectKey: 'objects/unrelated' },
  });
  expect(parseCapturedVideoProjectRows(rows)).toBeNull();
});
it('rejects binary values and cycles before serializing native metadata', () => {
  const rows = fixture();
  expect(parseCapturedVideoProjectRows({ ...rows, unexpected: new Blob(['bytes']) })).toBeNull();
  const cyclic: Record<string, unknown> = { ...rows };
  cyclic['loop'] = cyclic;
  expect(parseCapturedVideoProjectRows(cyclic)).toBeNull();
});
it('rejects unknown versions kinds and inconsistent root identities', () => {
  const row = change();
  expect(parseSyncCaptureRecord({ ...row, version: 2 })).toBeNull();
  expect(parseSyncCaptureRecord({ ...row, kind: 'future' })).toBeNull();
  expect(parseSyncCaptureRecord({ ...row, rootId: 'another-root' })).toBeNull();
  expect(parseSyncCaptureRecord({ ...row, change: { kind: 'future' } })).toBeNull();
});
it('keeps tuple keys distinct when opaque identities contain delimiters', () => {
  expect(captureRootKey('a:b', 'media', 'c')).not.toBe(captureRootKey('a', 'media', 'b:c'));
});
it('projects pending claims after the domain ref and owner can disappear', () => {
  const row = change();
  const claims = collectSyncCaptureClaims([row]);
  expect(claims.valid).toBe(true);
  expect(claims.assetIds).toEqual(new Set(['asset-object-1']));
  expect(collectSyncCaptureClaims([{ ...row, change: { kind: 'tombstone' } }]).assetIds.size).toBe(
    0
  );
});
it('makes retention invalid when any persisted capture cannot be admitted', () => {
  const claims = collectSyncCaptureClaims([change(), { kind: 'captured-change', version: 99 }]);
  expect(claims.valid).toBe(false);
  expect(claims.assetIds.has('asset-object-1')).toBe(true);
});
