// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { renderImage, renderVideo } from './rendering';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockCanvas() {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: vi.fn(),
    drawImage,
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
    callback(new Blob(['poster'], { type: 'image/webp' }))
  );
  return drawImage;
}

it('letterboxes a video frame at 640×360 and releases the media source', async () => {
  const drawImage = mockCanvas();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const createElement = document.createElement.bind(document);
  let video: HTMLVideoElement | undefined;
  vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
    const element = createElement(tagName, options);
    if (tagName === 'video') {
      video = element as HTMLVideoElement;
      Object.defineProperties(video, {
        videoWidth: { value: 800 },
        videoHeight: { value: 600 },
      });
      queueMicrotask(() => video?.dispatchEvent(new Event('loadeddata')));
    }
    return element;
  });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video-source');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

  const poster = await renderVideo(new Blob(['video']), new AbortController().signal);

  expect(poster.type).toBe('image/webp');
  expect(drawImage).toHaveBeenCalledWith(video, 80, 0, 480, 360);
  expect(video?.pause).toHaveBeenCalledOnce();
  expect(video?.load).toHaveBeenCalledOnce();
  expect(revoke).toHaveBeenCalledWith('blob:video-source');
});

it('cancels a stalled video decoder and releases its object URL', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stalled-video');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const controller = new AbortController();

  const poster = renderVideo(new Blob(['video']), controller.signal);
  controller.abort();

  await expect(poster).rejects.toThrow('cancelled');
  expect(revoke).toHaveBeenCalledWith('blob:stalled-video');
});

it('letterboxes an image when no scenario frame is supplied', async () => {
  const drawImage = mockCanvas();
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 600;
      naturalHeight = 800;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        if (value) queueMicrotask(() => this.onload?.());
      }
    }
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:portrait');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

  const poster = await renderImage(new Blob(['image']), new AbortController().signal);

  expect(poster.type).toBe('image/webp');
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 185, 0, 270, 360);
  expect(revoke).toHaveBeenCalledWith('blob:portrait');
});
