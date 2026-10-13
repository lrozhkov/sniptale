// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadVideoMetadata } from './index';

const mocks = vi.hoisted(() => ({
  tracks: vi.fn(),
  dispose: vi.fn(),
  peaks: vi.fn(),
  inspect: vi.fn(),
}));
vi.mock('../../../workflows/video-review/source', () => ({ inspectReviewVideo: mocks.inspect }));
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    getAudioTracks = mocks.tracks;
    dispose = mocks.dispose;
  },
}));
vi.mock('./helpers', () => ({
  resolveMediaDuration: async () => ({ duration: 12, isAuthoritative: true }),
  loadAudioPeaks: mocks.peaks,
}));

beforeEach(() => {
  mocks.inspect.mockResolvedValue({
    source: {
      duration: 12,
      width: 160,
      height: 90,
      mimeType: 'video/webm; codecs="vp8, opus"',
      size: 5,
    },
  });
  mocks.tracks.mockResolvedValue([]);
  mocks.peaks.mockResolvedValue([0.5]);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:video-metadata'),
    revokeObjectURL: vi.fn(),
  });
});

it('uses the same canonical native metadata as Gallery instead of element duration and Blob MIME', async () => {
  const metadata = await loadVideoMetadata(new Blob(['video'], { type: 'video/webm' }));
  expect(metadata).toMatchObject({
    duration: 12,
    width: 160,
    height: 90,
    mimeType: 'video/webm; codecs="vp8, opus"',
    size: 5,
  });
  expect(mocks.inspect).toHaveBeenCalledOnce();
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('detects embedded audio before the video element has decoded audio bytes', async () => {
  mocks.tracks.mockResolvedValue([{}]);
  const metadata = await loadVideoMetadata(new Blob(['video'], { type: 'video/webm' }));
  expect(metadata.hasAudio).toBe(true);
  expect(metadata.audioPeaks).toEqual([0.5]);
  expect(mocks.dispose).toHaveBeenCalledOnce();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('keeps a container without audio silent and skips audio decoding', async () => {
  const metadata = await loadVideoMetadata(new Blob(['video'], { type: 'video/mp4' }));
  expect(metadata.hasAudio).toBe(false);
  expect(metadata.audioPeaks).toBeNull();
  expect(mocks.peaks).not.toHaveBeenCalled();
  expect(mocks.dispose).toHaveBeenCalledOnce();
});

it('rejects unreadable track metadata instead of publishing a silent asset', async () => {
  mocks.tracks.mockRejectedValue(new Error('container unreadable'));
  await expect(loadVideoMetadata(new Blob(['broken']))).rejects.toThrow('container unreadable');
  expect(mocks.dispose).toHaveBeenCalledOnce();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(mocks.peaks).not.toHaveBeenCalled();
});

it('refuses invalid canonical source metadata before reading audio or creating fallback dimensions', async () => {
  mocks.inspect.mockRejectedValueOnce(new Error('invalid-metadata'));
  await expect(loadVideoMetadata(new Blob(['broken']))).rejects.toThrow('invalid-metadata');
  expect(mocks.tracks).not.toHaveBeenCalled();
  expect(mocks.peaks).not.toHaveBeenCalled();
});
