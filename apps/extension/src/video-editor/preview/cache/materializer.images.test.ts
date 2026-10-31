// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createImageClip } from '../../../features/video/project/timeline/project-meta.test.helpers';
import { VideoProjectAssetType } from '../../../features/video/project/types';
import { createVideoPreviewFrameMaterializer } from './materializer';

const renderPreviewScene = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../stage/scene/render-preview', () => ({ renderPreviewScene }));

afterEach(() => {
  renderPreviewScene.mockClear();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

function imageReadinessFixture(complete: boolean, naturalWidth: number) {
  const image = document.createElement('img');
  const readiness = { complete, naturalWidth };
  Object.defineProperties(image, {
    complete: { configurable: true, get: () => readiness.complete },
    naturalWidth: { configurable: true, get: () => readiness.naturalWidth },
  });
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tagName, options) =>
    tagName === 'img' ? image : createElement(tagName, options)
  );
  const project = createEmptyVideoProject('Image readiness');
  project.assets = [
    {
      id: 'image',
      name: 'Image',
      createdAt: 1,
      type: VideoProjectAssetType.IMAGE,
      source: { kind: 'recording', recordingId: 'recording' },
      metadata: {
        audioPeaks: null,
        duration: 1,
        hasAudio: false,
        height: 180,
        width: 320,
        mimeType: 'image/png',
        size: 100,
      },
    },
  ];
  project.clips = [createImageClip({ assetId: 'image', trackId: project.tracks[0]!.id })];
  const owner = createVideoPreviewFrameMaterializer({
    ownerDocument: document,
    project,
    assetUrls: { image: 'blob:image' },
    rasterSize: { width: 320, height: 180 },
  });
  return { image, readiness, owner };
}

it('rejects an image that failed before preparation without waiting for the frame timeout', async () => {
  vi.useFakeTimers();
  const { image, readiness, owner } = imageReadinessFixture(true, 0);
  image.dispatchEvent(new Event('error'));
  const failure = vi.fn();
  const pending = owner.renderFrame(0, new AbortController().signal).catch(failure);
  await vi.advanceTimersByTimeAsync(0);
  expect(failure).toHaveBeenCalledWith(new Error('Preview media could not be decoded'));
  await pending;
  expect(renderPreviewScene).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  readiness.naturalWidth = 320;
  await expect(owner.renderFrame(0, new AbortController().signal)).resolves.toBe(owner.canvas);
  expect(renderPreviewScene).toHaveBeenCalledOnce();
  owner.dispose();
});

it.each(['load', 'error', 'abort', 'timeout'] as const)(
  'settles pending image preparation on %s and releases its listeners and timer',
  async (event) => {
    vi.useFakeTimers();
    const { image, readiness, owner } = imageReadinessFixture(false, 0);
    const controller = new AbortController();
    const addImage = vi.spyOn(image, 'addEventListener');
    const removeImage = vi.spyOn(image, 'removeEventListener');
    const addAbort = vi.spyOn(controller.signal, 'addEventListener');
    const removeAbort = vi.spyOn(controller.signal, 'removeEventListener');
    const pending = owner.renderFrame(0, controller.signal);
    const outcome = pending.then(
      () => 'rendered',
      (error: unknown) => error
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(renderPreviewScene).not.toHaveBeenCalled();
    if (event === 'timeout') {
      await vi.advanceTimersByTimeAsync(2_000);
    } else if (event === 'abort') {
      controller.abort();
    } else {
      readiness.complete = true;
      readiness.naturalWidth = event === 'load' ? 320 : 0;
      image.dispatchEvent(new Event(event));
    }
    const expected =
      event === 'load'
        ? 'rendered'
        : event === 'abort'
          ? expect.objectContaining({ name: 'AbortError' })
          : new Error(
              event === 'error' ? 'Preview media could not be decoded' : 'Preview media timed out'
            );
    expect(await outcome).toEqual(expected);
    expect(renderPreviewScene).toHaveBeenCalledTimes(event === 'load' ? 1 : 0);
    for (const [name, listener] of addImage.mock.calls) {
      expect(removeImage).toHaveBeenCalledWith(name, listener);
    }
    for (const [name, listener] of addAbort.mock.calls) {
      expect(removeAbort).toHaveBeenCalledWith(name, listener);
    }
    expect(vi.getTimerCount()).toBe(0);
    owner.dispose();
  }
);

it.each([0, 320])(
  'honors cancellation before preparing a completed image of width %s',
  async (width) => {
    vi.useFakeTimers();
    const { owner } = imageReadinessFixture(true, width);
    const controller = new AbortController();
    controller.abort();
    await expect(owner.renderFrame(0, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(renderPreviewScene).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    owner.dispose();
  }
);
