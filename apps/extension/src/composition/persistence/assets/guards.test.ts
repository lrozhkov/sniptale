import { describe, expect, it } from 'vitest';
import {
  parseAssetOwner,
  parseAssetReadyJournal,
  parseAssetRef,
  parseBackupAssetOperation,
  parsePhysicalDeleteAssetOperation,
} from './guards';

const ref = {
  assetId: 'asset-1',
  createdAt: 1,
  location: { kind: 'opfs', objectKey: 'objects/asset-1' },
  mimeType: 'video/webm',
  sha256: null,
  size: 5,
};

describe('asset persistence guards', () => {
  it('accepts canonical refs and rejects malformed immutable metadata', () => {
    expect(parseAssetRef(ref)).toEqual(ref);
    for (const malformed of [
      null,
      { ...ref, assetId: '' },
      { ...ref, createdAt: Number.NaN },
      { ...ref, location: null },
      { ...ref, location: { kind: 'idb', objectKey: 'objects/asset-1' } },
      { ...ref, location: { kind: 'opfs', objectKey: 'objects/other' } },
      { ...ref, mimeType: '' },
      { ...ref, sha256: 3 },
      { ...ref, size: -1 },
      { ...ref, size: 1.5 },
    ]) {
      expect(parseAssetRef(malformed)).toBeNull();
    }
  });

  it('validates owner identity and ready-journal contents', () => {
    const owner = {
      assetId: 'asset-1',
      ownerId: 'recording-1',
      ownerKind: 'recording',
      role: 'body',
    };
    expect(parseAssetOwner(owner)).toEqual(owner);
    expect(parseAssetOwner({ ...owner, role: '' })).toBeNull();
    const journal = {
      assetRefs: [ref],
      createdAt: 2,
      domain: 'recording-assets',
      journalId: 'journal-1',
      operationId: 'restore-1',
      payload: { entries: [] },
    };
    expect(parseAssetReadyJournal(journal)).toEqual(journal);
    expect(parseAssetReadyJournal({ ...journal, assetRefs: [{}] })).toBeNull();
    expect(parseAssetReadyJournal({ ...journal, operationId: '' })).toBeNull();
    expect(parseAssetReadyJournal({ ...journal, payload: undefined })).toEqual({
      ...journal,
      payload: undefined,
    });
  });

  it('narrows backup and physical-delete operations', () => {
    const backup = {
      compensations: [],
      createdAt: 1,
      kind: 'backup-restore',
      obsoleteAssetIds: ['old-asset'],
      operationId: 'restore-1',
      status: 'pending',
      updatedAt: 2,
    };
    expect(parseBackupAssetOperation(backup)).toEqual(backup);
    expect(parseBackupAssetOperation({ ...backup, status: 'unknown' })).toBeNull();
    expect(parseBackupAssetOperation({ ...backup, obsoleteAssetIds: [3] })).toBeNull();
    expect(parseBackupAssetOperation({ ...backup, compensations: [{}] })).toBeNull();

    const physicalDelete = {
      assetIds: ['asset-1'],
      createdAt: 1,
      kind: 'physical-delete',
      operationId: 'delete-1',
      status: 'pending',
      updatedAt: 2,
    };
    expect(parsePhysicalDeleteAssetOperation(physicalDelete)).toEqual(physicalDelete);
    expect(parsePhysicalDeleteAssetOperation({ ...physicalDelete, assetIds: [''] })).toBeNull();
    expect(
      parsePhysicalDeleteAssetOperation({ ...physicalDelete, status: 'committed' })
    ).toBeNull();
  });
});
