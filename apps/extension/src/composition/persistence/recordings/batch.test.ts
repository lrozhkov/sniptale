import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertAdmission: vi.fn(),
  discard: vi.fn(),
  preparePublication: vi.fn(),
  publishJournal: vi.fn(),
  publishWithRetry: vi.fn(),
  recover: vi.fn(),
  releaseProtection: vi.fn(),
  writeBlob: vi.fn(),
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  assertAssetWriteAdmission: mocks.assertAdmission,
  discardPreparedAsset: mocks.discard,
  createAssetPublicationJournal: mocks.preparePublication,
  publishReadyJournalWithRetry: mocks.publishWithRetry,
  releaseAssetReadyProtection: mocks.releaseProtection,
  writeBlobToAsset: mocks.writeBlob,
}));

vi.mock('./asset-publication', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./asset-publication')>()),
  publishRecordingAssetJournal: mocks.publishJournal,
  RECORDING_ASSET_PUBLICATION_DOMAIN: 'recording-assets',
  recoverRecordingAssetPublications: mocks.recover,
}));

import { saveRecordingsBatch, saveRecordingsBatchWithCompletion } from './batch';
import type { PreparedAssetObject } from '../assets';

function asset(assetId: string, mimeType = 'video/webm', size = 5): PreparedAssetObject {
  return {
    ref: {
      assetId,
      createdAt: 1,
      location: { kind: 'opfs', objectKey: `objects/${assetId}` },
      mimeType,
      sha256: null,
      size,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertAdmission.mockResolvedValue(undefined);
  mocks.discard.mockResolvedValue(undefined);
  mocks.preparePublication.mockImplementation(async (input) => ({
    ...input,
    createdAt: 2,
    journalId: 'journal-1',
  }));
  mocks.publishWithRetry.mockResolvedValue(undefined);
  mocks.recover.mockResolvedValue(0);
  mocks.writeBlob
    .mockResolvedValueOnce(asset('asset-video'))
    .mockResolvedValueOnce(asset('asset-audio', 'audio/webm'));
});

describe('recording asset publication', () => {
  it('admits aggregate bytes, writes immutable objects, and publishes one atomic batch', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700);
    const entries = await saveRecordingsBatch([
      { id: 'video-1', blob: new Blob(['video'], { type: 'video/webm' }), filename: '1.webm' },
      {
        id: 'audio-1',
        blob: new Blob(['audio'], { type: 'audio/webm' }),
        filename: '1-audio.webm',
      },
    ]);

    expect(mocks.recover.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.assertAdmission.mock.invocationCallOrder[0]!
    );
    expect(mocks.assertAdmission).toHaveBeenCalledWith(10);
    expect(mocks.writeBlob).toHaveBeenCalledTimes(2);
    expect(entries).toEqual([
      expect.objectContaining({ assetId: 'asset-video', id: 'video-1', size: 5 }),
      expect.objectContaining({ assetId: 'asset-audio', id: 'audio-1', mimeType: 'audio/webm' }),
    ]);
    expect(mocks.preparePublication).toHaveBeenCalledWith({
      assetRefs: [asset('asset-video').ref, asset('asset-audio', 'audio/webm').ref],
      domain: 'recording-assets',
      payload: { completion: null, entries },
    });
    expect(mocks.publishWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({ journalId: 'journal-1' }),
      mocks.publishJournal
    );
  });

  it('publishes completion in the same journal and accepts an already staged object', async () => {
    const preparedAsset = asset('staged');
    const completion = {
      primaryRecordingId: 'video-1',
      projectId: null,
      recordingId: 'session-1',
    };

    await saveRecordingsBatchWithCompletion(
      [{ id: 'video-1', filename: '1.webm', preparedAsset }],
      completion
    );

    expect(mocks.assertAdmission).not.toHaveBeenCalled();
    expect(mocks.writeBlob).not.toHaveBeenCalled();
    expect(mocks.preparePublication).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ completion }) })
    );
  });

  it('removes prepared objects when ready journal creation fails', async () => {
    mocks.preparePublication.mockRejectedValueOnce(new Error('journal failed'));

    await expect(
      saveRecordingsBatch([{ id: 'video-1', blob: new Blob(['video']), filename: '1.webm' }])
    ).rejects.toThrow('journal failed');

    expect(mocks.discard).toHaveBeenCalledWith('asset-video');
  });

  it('keeps objects protected by ready after publication retries fail', async () => {
    mocks.publishWithRetry.mockRejectedValueOnce(new Error('transaction failed'));

    await expect(
      saveRecordingsBatch([{ id: 'video-1', blob: new Blob(['video']), filename: '1.webm' }])
    ).rejects.toThrow('transaction failed');

    expect(mocks.discard).not.toHaveBeenCalled();
  });

  it('rejects duplicates and missing binary sources before mutation', async () => {
    const blob = new Blob(['video']);
    await expect(
      saveRecordingsBatch([
        { id: 'same', blob, filename: '1.webm' },
        { id: 'same', blob, filename: '2.webm' },
      ])
    ).rejects.toThrow('Duplicate recording ID');
    await expect(
      saveRecordingsBatch([{ id: 'missing', filename: 'missing.webm' }])
    ).rejects.toThrow('exactly one binary source');
    expect(mocks.recover).not.toHaveBeenCalled();
  });
});
