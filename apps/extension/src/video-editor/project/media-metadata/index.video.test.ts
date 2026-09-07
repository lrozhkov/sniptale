// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadVideoMetadata } from './index';

const mocks = vi.hoisted(() => ({ tracks: vi.fn(), dispose: vi.fn(), peaks: vi.fn() }));
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
  mocks.tracks.mockResolvedValue([]);
  mocks.peaks.mockResolvedValue([0.5]);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:video-metadata'),
    revokeObjectURL: vi.fn(),
  });
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
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video-metadata');
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
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video-metadata');
  expect(mocks.peaks).not.toHaveBeenCalled();
});
