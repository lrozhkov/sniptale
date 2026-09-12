// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ entry: vi.fn(), blob: vi.fn() }));
vi.mock('../../../composition/persistence/media-library', () => ({
  getMediaLibraryEntry: io.entry,
  getMediaAssetBlob: io.blob,
}));
import { captureGuideVideoFrame, loadGuideVideoSource } from './video-frame';
beforeEach(() => vi.resetAllMocks());
const originalContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')!;
afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', originalContext);
});
function video() {
  const element = document.createElement('video');
  Object.defineProperties(element, {
    videoWidth: { value: 8000 },
    videoHeight: { value: 4000 },
    readyState: { value: 2, configurable: true },
    currentSrc: { value: 'blob:source', configurable: true },
  });
  element.currentTime = 1.25;
  vi.spyOn(element, 'pause').mockImplementation(() => {});
  return element;
}
function canvas() {
  const draw = vi.fn();
  const context = { drawImage: draw };
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => context,
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
    callback(new Blob(['png'], { type: 'image/png' }))
  );
  return draw;
}
it('reads explicit local sources and rejects missing or changed library video', async () => {
  const signal = new AbortController().signal;
  const file = new File(['video'], 'source.webm', { type: 'video/webm' });
  expect(await loadGuideVideoSource(file, signal)).toMatchObject({
    blob: file,
    filename: 'source.webm',
    recordingId: null,
  });
  const entry = {
    id: 'media',
    kind: 'video',
    updatedAt: 1,
    size: 5,
    filename: 'source.webm',
    source: { kind: 'recording', recordingId: 'recording' },
  };
  io.entry.mockResolvedValue(entry);
  io.blob.mockResolvedValue(file);
  expect(await loadGuideVideoSource({ mediaId: 'media' }, signal)).toMatchObject({
    recordingId: 'recording',
  });
  io.entry.mockResolvedValueOnce(entry).mockResolvedValueOnce({ ...entry, updatedAt: 2 });
  await expect(loadGuideVideoSource({ mediaId: 'media' }, signal)).rejects.toThrow('changed');
  io.entry.mockResolvedValueOnce(undefined);
  await expect(loadGuideVideoSource({ mediaId: 'missing' }, signal)).rejects.toThrow('unavailable');
  await expect(
    loadGuideVideoSource(new File(['x'], 'text', { type: 'text/plain' }), signal)
  ).rejects.toThrow('Unsupported');
});
it('captures paused current pixels at bounded dimensions and records playback position', async () => {
  const element = video();
  const draw = canvas();
  const frame = await captureGuideVideoFrame(element, new AbortController().signal);
  expect(element.pause).toHaveBeenCalledOnce();
  expect(draw).toHaveBeenCalledWith(element, 0, 0, 4096, 2048);
  expect(frame).toMatchObject({ timeSeconds: 1.25, blob: expect.any(Blob) });
});
it('rejects seeking, stale, cancelled and failed encodes', async () => {
  const element = video();
  canvas();
  Object.defineProperty(element, 'readyState', { value: 1 });
  await expect(captureGuideVideoFrame(element, new AbortController().signal)).rejects.toThrow(
    'not ready'
  );
  Object.defineProperty(element, 'readyState', { value: 2 });
  vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce((callback) => {
    element.currentTime = 2;
    callback(new Blob(['png']));
  });
  await expect(captureGuideVideoFrame(element, new AbortController().signal)).rejects.toThrow(
    'changed'
  );
  vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce((callback) =>
    callback(null)
  );
  await expect(captureGuideVideoFrame(element, new AbortController().signal)).rejects.toThrow(
    'encoding'
  );
  const controller = new AbortController();
  vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce(() => controller.abort());
  await expect(captureGuideVideoFrame(element, controller.signal)).rejects.toThrow();
});
it.each(['recording', 'export'])('loads real %s library videos before playback', async (kind) => {
  const blob = new Blob(['video'], { type: 'video/webm' });
  io.entry.mockResolvedValue({
    id: 'media',
    kind,
    filename: 'video.webm',
    mimeType: 'video/webm',
    updatedAt: 1,
    size: 5,
    source: { kind: 'recording', recordingId: 'recording' },
  });
  io.blob.mockResolvedValue(blob);
  await expect(
    loadGuideVideoSource({ mediaId: 'media' }, new AbortController().signal)
  ).resolves.toMatchObject({ blob, recordingId: 'recording' });
});
