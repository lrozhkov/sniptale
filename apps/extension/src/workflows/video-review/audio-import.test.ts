import { afterEach, describe, expect, it, vi } from 'vitest';
import { importAudioAsset, importedAudioClip } from './audio-import';

vi.mock('../media-hub/store', () => ({
  saveProjectAssetSafely: vi.fn(async () => undefined),
}));

describe('audio import', () => {
  afterEach(() => vi.restoreAllMocks());

  it('stores the file as a library asset and returns a bounded clip reference', async () => {
    class FakeContext {
      async decodeAudioData(buffer: ArrayBuffer) {
        expect(buffer.byteLength).toBe(8);
        return { duration: 12 };
      }
      async close() {
        return undefined;
      }
    }
    vi.stubGlobal('AudioContext', FakeContext);
    const { assetId, duration } = await importAudioAsset(
      new File([new Uint8Array(8)], 'song.mp3', { type: 'audio/mpeg' })
    );
    expect(assetId).toMatch(/^project-asset:[0-9a-f-]+$/);
    expect(duration).toBe(12);
    expect(
      vi.mocked((await import('../media-hub/store')).saveProjectAssetSafely)
    ).toHaveBeenCalledWith(expect.any(String), expect.anything(), 'audio/mpeg', 'song.mp3');
    const clip = importedAudioClip(assetId, duration, 4, 10);
    expect(clip.assetId).toBe(assetId);
    expect(clip.timelineStart).toBe(4);
    expect(clip.duration).toBe(6);
    vi.unstubAllGlobals();
  });

  it('rejects files outside the supported duration window', async () => {
    class FakeContext {
      async decodeAudioData() {
        return { duration: 0.01 };
      }
      async close() {}
    }
    vi.stubGlobal('AudioContext', FakeContext);
    await expect(
      importAudioAsset(new File([new Uint8Array(2)], 'tiny.mp3', { type: 'audio/mpeg' }))
    ).rejects.toThrow('Unsupported audio duration.');
    vi.unstubAllGlobals();
  });

  it('falls back to the generic audio mime for unknown types', async () => {
    class FakeContext {
      async decodeAudioData() {
        return { duration: 3 };
      }
      async close() {}
    }
    vi.stubGlobal('AudioContext', FakeContext);
    await importAudioAsset(new File([new Uint8Array(2)], 'song', { type: '' }));
    expect(
      vi.mocked((await import('../media-hub/store')).saveProjectAssetSafely)
    ).toHaveBeenLastCalledWith(expect.any(String), expect.anything(), 'audio/mpeg', 'song');
    vi.unstubAllGlobals();
  });
});
