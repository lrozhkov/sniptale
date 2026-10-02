import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UnsupportedAudioFileError,
  importReviewAudio,
  importedAudioClip,
  prepareReviewAudio,
  type PreparedReviewAudio,
} from './audio-import';

const storeMocks = vi.hoisted(() => ({
  writeBlobToAsset: vi.fn(),
  createAssetPublicationJournal: vi.fn(),
  cancelAssetPublication: vi.fn(async () => undefined),
  publishReadyJournalWithRetry: vi.fn(),
  releaseAssetReadyProtection: vi.fn(),
  discardPreparedAsset: vi.fn(),
  assertAssetWriteAdmission: vi.fn(async () => undefined),
  recoverProjectMediaPublications: vi.fn(async () => undefined),
  publishMediaHubLibraryChanged: vi.fn(),
}));

vi.mock('../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal()),
  writeBlobToAsset: storeMocks.writeBlobToAsset,
  createAssetPublicationJournal: storeMocks.createAssetPublicationJournal,
  cancelAssetPublication: storeMocks.cancelAssetPublication,
  publishReadyJournalWithRetry: storeMocks.publishReadyJournalWithRetry,
  releaseAssetReadyProtection: storeMocks.releaseAssetReadyProtection,
  discardPreparedAsset: storeMocks.discardPreparedAsset,
  assertAssetWriteAdmission: storeMocks.assertAssetWriteAdmission,
}));
vi.mock('../../composition/persistence/projects/asset-publication', async (importOriginal) => ({
  ...(await importOriginal()),
  recoverProjectMediaPublications: storeMocks.recoverProjectMediaPublications,
}));
vi.mock('../../composition/persistence/infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: vi.fn(async () => ({ get: vi.fn(async () => undefined) })),
}));
vi.mock('../../features/media-hub/events', () => ({
  publishMediaHubLibraryChanged: storeMocks.publishMediaHubLibraryChanged,
}));

const file = (size: number, type = 'audio/mpeg') =>
  new File([new Uint8Array(size)], 'song.mp3', { type });

function stubDuration(duration: number | null, fail = false) {
  class FakeContext {
    async decodeAudioData() {
      if (fail) throw new Error('not audio');
      return { duration };
    }
    async close() {
      return undefined;
    }
  }
  vi.stubGlobal('AudioContext', FakeContext);
}

const preparedRef = {
  assetId: 'opfs-object',
  createdAt: 1,
  location: { kind: 'opfs' as const },
  mimeType: 'audio/mpeg',
  sha256: null,
  size: 8,
};

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  storeMocks.createAssetPublicationJournal.mockResolvedValue({
    journalId: 'journal-1',
    assetRefs: [preparedRef],
  });
});

describe('prepareReviewAudio', () => {
  it('admits audio, stages it under ready protection, and returns the review reference', async () => {
    stubDuration(3);
    storeMocks.writeBlobToAsset.mockResolvedValue({
      ref: { ...preparedRef, mimeType: 'audio/mpeg', size: 8 },
    });
    const signal = new AbortController().signal;
    const prepared = await prepareReviewAudio(file(8), signal);
    expect(prepared.assetId).toMatch(/^project-asset:[0-9a-f-]+$/);
    expect(prepared.duration).toBe(3);
    expect(storeMocks.writeBlobToAsset).toHaveBeenCalledTimes(1);
    expect(storeMocks.createAssetPublicationJournal).not.toHaveBeenCalled();
  });

  it('rejects non-audio files before any storage write', async () => {
    stubDuration(3);
    await expect(
      prepareReviewAudio(file(8, 'text/plain'), new AbortController().signal)
    ).rejects.toThrow(UnsupportedAudioFileError);
    expect(storeMocks.writeBlobToAsset).not.toHaveBeenCalled();
  });

  it('rejects oversize files before any storage write', async () => {
    stubDuration(3);
    const signal = new AbortController().signal;
    await expect(prepareReviewAudio(file(200 * 1024 * 1024), signal)).rejects.toThrow(
      'Unsupported audio size.'
    );
    expect(storeMocks.writeBlobToAsset).not.toHaveBeenCalled();
  });

  it('rejects undecodable content with a diagnosable error', async () => {
    stubDuration(null, true);
    await expect(prepareReviewAudio(file(8), new AbortController().signal)).rejects.toThrow(
      'Unsupported audio file.'
    );
    expect(storeMocks.writeBlobToAsset).not.toHaveBeenCalled();
  });

  it('rejects files outside the supported duration window before storage', async () => {
    stubDuration(0.01);
    await expect(prepareReviewAudio(file(8), new AbortController().signal)).rejects.toThrow(
      'Unsupported audio duration.'
    );
    expect(storeMocks.writeBlobToAsset).not.toHaveBeenCalled();
  });
});

describe('importReviewAudio', () => {
  it('publishes only after the durable attachment succeeds', async () => {
    stubDuration(3);
    storeMocks.writeBlobToAsset.mockResolvedValue({
      ref: { ...preparedRef, mimeType: 'audio/mpeg', size: 8 },
    });
    await importReviewAudio({
      file: file(8),
      signal: new AbortController().signal,
      attach: async (assetId, duration) => {
        expect(assetId).toMatch(/^project-asset:[0-9a-f-]+$/);
        expect(duration).toBe(3);
        expect(storeMocks.createAssetPublicationJournal).toHaveBeenCalledOnce();
        expect(storeMocks.publishReadyJournalWithRetry).not.toHaveBeenCalled();
      },
      assertCurrentTarget: () => undefined,
    });
    expect(storeMocks.createAssetPublicationJournal).toHaveBeenCalledTimes(1);
    expect(storeMocks.publishReadyJournalWithRetry).toHaveBeenCalledTimes(1);
    expect(storeMocks.releaseAssetReadyProtection).toHaveBeenCalledTimes(1);
    expect(storeMocks.discardPreparedAsset).not.toHaveBeenCalled();
    expect(storeMocks.publishMediaHubLibraryChanged).toHaveBeenCalledWith(
      'create',
      expect.arrayContaining([expect.stringMatching(/^project-asset:[0-9a-f-]+$/)])
    );
  });

  it('discards the prepared asset when the attachment fails', async () => {
    stubDuration(3);
    storeMocks.writeBlobToAsset.mockResolvedValue({
      ref: { ...preparedRef, mimeType: 'audio/mpeg', size: 8 },
    });
    await expect(
      importReviewAudio({
        file: file(8),
        signal: new AbortController().signal,
        attach: async () => {
          throw new Error('autosave failed');
        },
        assertCurrentTarget: () => undefined,
      })
    ).rejects.toThrow('autosave failed');
    expect(storeMocks.discardPreparedAsset).not.toHaveBeenCalled();
    expect(storeMocks.createAssetPublicationJournal).toHaveBeenCalledOnce();
    expect(storeMocks.cancelAssetPublication).toHaveBeenCalledWith(
      expect.objectContaining({ journalId: 'journal-1' })
    );
  });

  it('retains protected bytes when attachment may have committed before rejecting', async () => {
    stubDuration(3);
    storeMocks.writeBlobToAsset.mockResolvedValue({ ref: preparedRef });
    await expect(
      importReviewAudio({
        file: file(8),
        signal: new AbortController().signal,
        attach: async () => {
          throw new Error('acknowledgement failed');
        },
        hasDurableReference: () => true,
        assertCurrentTarget: () => undefined,
      })
    ).rejects.toThrow('acknowledgement failed');
    expect(storeMocks.discardPreparedAsset).not.toHaveBeenCalled();
  });

  it('keeps a publication journal for recovery when publishing fails after attachment', async () => {
    stubDuration(3);
    storeMocks.writeBlobToAsset.mockResolvedValue({
      ref: { ...preparedRef, mimeType: 'audio/mpeg', size: 8 },
    });
    storeMocks.publishReadyJournalWithRetry.mockRejectedValueOnce(new Error('publish failed'));
    await expect(
      importReviewAudio({
        file: file(8),
        signal: new AbortController().signal,
        attach: async () => undefined,
        assertCurrentTarget: () => undefined,
      })
    ).rejects.toThrow('publish failed');
    expect(storeMocks.discardPreparedAsset).not.toHaveBeenCalled();
  });

  it('rejects before attachment and discards bytes when journal creation fails', async () => {
    stubDuration(3);
    storeMocks.writeBlobToAsset.mockResolvedValue({
      ref: { ...preparedRef, mimeType: 'audio/mpeg', size: 8 },
    });
    storeMocks.createAssetPublicationJournal.mockRejectedValueOnce(new Error('journal failed'));
    const attach = vi.fn(async () => undefined);
    await expect(
      importReviewAudio({
        file: file(8),
        signal: new AbortController().signal,
        attach,
        assertCurrentTarget: () => undefined,
      })
    ).rejects.toThrow('journal failed');
    expect(attach).not.toHaveBeenCalled();
    expect(storeMocks.discardPreparedAsset).toHaveBeenCalledOnce();
  });

  it('stages fresh material on retry after journal creation fails before attachment', async () => {
    stubDuration(3);
    storeMocks.writeBlobToAsset.mockResolvedValue({ ref: preparedRef });
    storeMocks.createAssetPublicationJournal.mockRejectedValueOnce(new Error('journal failed'));
    const attach = vi.fn(async () => undefined);
    await expect(
      importReviewAudio({
        file: file(8),
        signal: new AbortController().signal,
        attach,
        assertCurrentTarget: () => undefined,
      })
    ).rejects.toThrow('journal failed');
    await importReviewAudio({
      file: file(8),
      signal: new AbortController().signal,
      attach,
      assertCurrentTarget: () => undefined,
    });
    expect(attach).toHaveBeenCalledOnce();
    expect(storeMocks.writeBlobToAsset).toHaveBeenCalledTimes(2);
    expect(storeMocks.createAssetPublicationJournal).toHaveBeenCalledTimes(2);
    expect(storeMocks.publishReadyJournalWithRetry).toHaveBeenCalledOnce();
    expect(storeMocks.discardPreparedAsset).toHaveBeenCalledOnce();
  });

  it('reuses the existing journal when a published take needs a retry', async () => {
    stubDuration(3);
    storeMocks.writeBlobToAsset.mockResolvedValue({ ref: preparedRef });
    storeMocks.createAssetPublicationJournal.mockResolvedValueOnce({
      journalId: 'journal-1',
      assetRefs: [preparedRef],
    });
    storeMocks.publishReadyJournalWithRetry.mockRejectedValueOnce(new Error('publish failed'));
    let prepared!: PreparedReviewAudio;
    await expect(
      importReviewAudio({
        file: file(8),
        signal: new AbortController().signal,
        attach: async () => undefined,
        assertCurrentTarget: () => undefined,
        onPrepared: (staged) => {
          prepared = staged;
        },
      })
    ).rejects.toThrow('publish failed');
    await expect(prepared.publish()).resolves.toBeUndefined();
    expect(storeMocks.writeBlobToAsset).toHaveBeenCalledOnce();
    expect(storeMocks.createAssetPublicationJournal).toHaveBeenCalledOnce();
    expect(storeMocks.publishReadyJournalWithRetry).toHaveBeenCalledTimes(2);
    expect(storeMocks.discardPreparedAsset).not.toHaveBeenCalled();
  });

  it('discards the prepared asset when the target changed before attachment', async () => {
    stubDuration(3);
    storeMocks.writeBlobToAsset.mockResolvedValue({
      ref: { ...preparedRef, mimeType: 'audio/mpeg', size: 8 },
    });
    await expect(
      importReviewAudio({
        file: file(8),
        signal: new AbortController().signal,
        attach: async () => undefined,
        assertCurrentTarget: () => {
          throw new Error('Review workspace changed.');
        },
      })
    ).rejects.toThrow('Review workspace changed.');
    expect(storeMocks.discardPreparedAsset).toHaveBeenCalledTimes(1);
  });

  it('aborts the import before any storage write', async () => {
    stubDuration(3);
    const controller = new AbortController();
    controller.abort();
    await expect(
      importReviewAudio({
        file: file(8),
        signal: controller.signal,
        attach: async () => undefined,
        assertCurrentTarget: () => undefined,
      })
    ).rejects.toThrow();
    expect(storeMocks.writeBlobToAsset).not.toHaveBeenCalled();
    expect(storeMocks.discardPreparedAsset).not.toHaveBeenCalled();
  });

  it('discards the staged asset when the attachment cancels after staging', async () => {
    stubDuration(3);
    storeMocks.writeBlobToAsset.mockResolvedValue({
      ref: { ...preparedRef, mimeType: 'audio/mpeg', size: 8 },
    });
    const controller = new AbortController();
    await expect(
      importReviewAudio({
        file: file(8),
        signal: controller.signal,
        attach: () => {
          controller.abort();
          controller.signal.throwIfAborted();
          return Promise.resolve();
        },
        assertCurrentTarget: () => undefined,
      })
    ).rejects.toThrow();
    expect(storeMocks.discardPreparedAsset).not.toHaveBeenCalled();
    expect(storeMocks.cancelAssetPublication).toHaveBeenCalledWith(
      expect.objectContaining({ journalId: 'journal-1' })
    );
  });
});

describe('importedAudioClip', () => {
  it('places a bounded clip at the target time', () => {
    const clip = importedAudioClip('project-asset:a', 12, 4, 10);
    expect(clip.assetId).toBe('project-asset:a');
    expect(clip.timelineStart).toBe(4);
    expect(clip.duration).toBe(6);
  });
});
