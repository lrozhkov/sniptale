import { afterEach, expect, it, vi } from 'vitest';
import * as captures from './preview-presentation-frame';
import { captureReviewPreviewFrame } from './preview-presentation-frame';
import { VideoSample } from 'mediabunny';
import type { Description } from './preview-presentation-state';

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const raw = {
    format: 'NV12',
    visibleRect: { x: 0, y: 0, width: 1904, height: 984 },
    codedWidth: 1904,
    codedHeight: 992,
    displayWidth: 1904,
    displayHeight: 984,
    colorSpace: {},
    timestamp: 15_000_000,
    duration: null,
    allocationSize: () => 1904 * 984 * 1.5,
    copyTo: vi.fn(async () => [
      { offset: 0, stride: 1904 },
      { offset: 1904 * 984, stride: 1904 },
    ]),
    close: vi.fn(),
  };
  const packed = { close: vi.fn() };
  let created = false;
  vi.stubGlobal(
    'VideoFrame',
    vi.fn(function () {
      if (!created) {
        created = true;
        return raw;
      }
      return packed;
    })
  );
  const description: Description = {
    scene: {
      source: { width: 1904, height: 984 },
      background: { enabled: false },
      zoomRegions: [],
      comments: [],
      keys: [],
      clicks: [],
    },
    dimensions: { canonical: { width: 1904, height: 984 }, backing: { width: 952, height: 492 } },
    cameraTransform: undefined,
    sourceTime: 15,
  };
  const reservation = { release: vi.fn() };
  const reserveSource = vi.fn(() => reservation);
  const sourceTime = vi.fn(() => 15);
  const video = { currentSrc: 'blob:original' } as HTMLVideoElement;
  const captured = captureReviewPreviewFrame({
    video,
    description,
    sequence: 1,
    time: 12,
    transition: null,
    sourceTime,
    reserveSource,
    captureCamera: () => undefined,
  })!;
  return { raw, packed, captured, sourceTime, reserveSource, reservation, video, description };
}

it('draws visible-plane packed captures and retains capture-time facts across asynchronous preparation', async () => {
  const { raw, packed, captured, sourceTime, reserveSource, reservation } = setup();
  sourceTime.mockReturnValue(20);
  await captured.value.source.prepare!(new AbortController().signal);
  const drawImage = vi.fn();
  captured.value.source.draw({ drawImage } as unknown as CanvasRenderingContext2D, 0, 0, 952, 492);
  expect(drawImage).toHaveBeenCalledWith(packed, 0, 0, 952, 492);
  expect(captured.value.sourceTime).toBe(15);
  expect(captured.value.resultTime).toBe(12);
  expect(captured.value.source.timestamp).toBe(15);
  expect(reserveSource).toHaveBeenCalledWith(raw.allocationSize() * 3);
  expect(raw.close).toHaveBeenCalledOnce();
  captured.release();
  expect(packed.close).toHaveBeenCalledOnce();
  expect(reservation.release).toHaveBeenCalledOnce();
});

it('releases the capture and its overlapping source reservation after cancelled normalization', async () => {
  const { raw, captured, reservation } = setup();
  const controller = new AbortController();
  controller.abort();
  await expect(captured.value.source.prepare!(controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  captured.release();
  expect(raw.close).toHaveBeenCalledOnce();
  expect(reservation.release).toHaveBeenCalledOnce();
});

it('exposes a borrowed original frame before normalization for direct GPU sampling', () => {
  const { raw, captured, reservation } = setup();
  expect(captured.value.source.videoFrame?.()).toBe(raw);
  expect(raw.copyTo).not.toHaveBeenCalled();
  expect(raw.close).not.toHaveBeenCalled();
  captured.release();
  expect(raw.close).toHaveBeenCalledOnce();
  expect(reservation.release).toHaveBeenCalledOnce();
});

function decodedFixture() {
  const legacy = setup();
  legacy.captured.release();
  const frames: TestFrame[] = [];
  const copy = vi.fn(async () => [
    { offset: 0, stride: 4 },
    { offset: 8, stride: 4 },
  ]);
  class TestFrame {
    format = 'NV12';
    visibleRect = { x: 0, y: 0, width: 4, height: 2 };
    codedWidth = 4;
    codedHeight: number;
    displayWidth = 4;
    displayHeight = 2;
    colorSpace = {};
    timestamp = 14_950_000;
    duration = 50_000;
    close = vi.fn();
    allocationSize = () => 12;
    copyTo = copy;
    constructor(data: unknown, init?: VideoFrameBufferInit) {
      this.codedHeight = init?.codedHeight ?? (data instanceof TestFrame ? data.codedHeight : 4);
      frames.push(this);
    }
  }
  vi.stubGlobal('VideoFrame', TestFrame);
  const raw = new VideoFrame(new Uint8Array(12), {
    format: 'NV12',
    codedWidth: 4,
    codedHeight: 4,
    timestamp: 14_950_000,
  });
  const releaseSource = vi.fn();
  const reservation = { release: vi.fn() };
  const reserveSource = vi.fn(() => reservation);
  const source = {
    sourceWidth: 2,
    sourceHeight: 4,
    orientation: { rotation: 90 as const, flip: true },
    toVideoFrame: vi.fn(() => raw),
    draw: vi.fn(),
  };
  const args = {
    binding: {
      source,
      target: 15.009,
      timestamp: 14.95,
      nextTimestamp: 15.02,
      url: 'blob:decoded',
    },
    releaseSource,
    description: legacy.description,
    sequence: 3,
    time: 12,
    transition: null,
    reserveSource,
    captureCamera: () => undefined,
  };
  return { args, frames, source, raw, releaseSource, reservation, reserveSource, copy };
}

it('captures original decoded PTS and orientation without copying GPU pixels or changing composition clocks', () => {
  const f = decodedFixture();
  const captured = captures.captureDecodedReviewPreviewFrame(f.args);
  expect(captured.value).toMatchObject({
    generation: 3,
    sourceTime: 15.009,
    resultTime: 12,
    source: { timestamp: 14.95, orientation: { rotation: 90, flip: true } },
  });
  const gpu = captured.value.source.videoFrame!();
  expect(captured.value.source.videoFrame!()).toBe(gpu);
  expect(f.source.toVideoFrame).toHaveBeenCalledOnce();
  expect(f.frames.every((frame) => frame.copyTo.mock.calls.length === 0)).toBe(true);
  expect(f.raw.close).not.toHaveBeenCalled();
  expect(f.releaseSource).not.toHaveBeenCalled();
  captured.release();
  captured.release();
  expect(f.frames.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
  expect(f.releaseSource).toHaveBeenCalledOnce();
  expect(f.reservation.release).toHaveBeenCalledOnce();
});

it('packs padded planes only for Canvas fallback and preserves sample draw orientation', async () => {
  const f = decodedFixture();
  const drawn: { rotation: number; flip: boolean }[] = [];
  const draw = vi.spyOn(VideoSample.prototype, 'draw').mockImplementation(function (
    this: VideoSample
  ) {
    drawn.push({ rotation: this.rotation, flip: this.flip });
  });
  try {
    const captured = captures.captureDecodedReviewPreviewFrame(f.args);
    captured.value.source.videoFrame!();
    await captured.value.source.prepare!(new AbortController().signal);
    captured.value.source.draw({} as CanvasRenderingContext2D, 0, 0, 20, 40);
    expect(drawn).toEqual([{ rotation: 90, flip: true }]);
    expect(f.copy).toHaveBeenCalledOnce();
    expect(f.reserveSource).toHaveBeenCalledWith(36);
    captured.release();
    captured.release();
    expect(f.frames.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
    expect(f.releaseSource).toHaveBeenCalledOnce();
  } finally {
    draw.mockRestore();
  }
});

it.each(['source', 'reservation', 'camera'] as const)(
  'rolls decoded source ownership back on %s capture failure',
  (stage) => {
    const f = decodedFixture();
    if (stage === 'source')
      f.source.toVideoFrame.mockImplementation(() => {
        throw new Error('private source detail');
      });
    const captured = () =>
      captures.captureDecodedReviewPreviewFrame({
        ...f.args,
        reserveSource:
          stage === 'reservation'
            ? () => {
                throw new Error('private allocation detail');
              }
            : f.reserveSource,
        captureCamera:
          stage === 'camera'
            ? () => {
                throw new Error('private camera detail');
              }
            : f.args.captureCamera,
      });
    expect(captured).toThrow('Preview source frame is unavailable.');
    expect(f.releaseSource).toHaveBeenCalledOnce();
    if (stage !== 'source') expect(f.raw.close).toHaveBeenCalledOnce();
    expect(f.reservation.release).toHaveBeenCalledTimes(stage === 'camera' ? 1 : 0);
  }
);

it('closes a normalization result that completes after its captured lease was released', async () => {
  const f = decodedFixture();
  const copying = Promise.withResolvers<void>();
  const planes = Promise.withResolvers<PlaneLayout[]>();
  f.copy.mockImplementation(async () => {
    copying.resolve();
    return await planes.promise;
  });
  const captured = captures.captureDecodedReviewPreviewFrame(f.args);
  captured.value.source.videoFrame!();
  const pending = captured.value.source.prepare!(new AbortController().signal).catch(
    (error: unknown) => error
  );
  await copying.promise;
  captured.release();
  planes.resolve([
    { offset: 0, stride: 4 },
    { offset: 8, stride: 4 },
  ]);
  expect(await pending).toBeInstanceOf(Error);
  expect(f.frames.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
  expect(f.releaseSource).toHaveBeenCalledOnce();
  expect(f.reservation.release).toHaveBeenCalledOnce();
});

it('preserves camera ownership through cancelled decoded normalization', async () => {
  const f = decodedFixture();
  const camera = {
    allocationBytes: 16,
    representedMediaTime: 7,
    generation: 9,
    source: { width: 2, height: 2 },
    placement: { x: 0.8, y: 0.8, width: 0.2, height: 0.2 },
    drawable: { draw: vi.fn() },
    release: vi.fn(),
  };
  const captured = captures.captureDecodedReviewPreviewFrame({
    ...f.args,
    captureCamera: () => camera,
  });
  expect(captured.value.camera).toMatchObject({
    representedMediaTime: 7,
    generation: 9,
    placement: camera.placement,
  });
  const controller = new AbortController();
  controller.abort();
  await expect(captured.value.source.prepare!(controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  captured.release();
  captured.release();
  expect(camera.release).toHaveBeenCalledOnce();
  expect(f.raw.close).toHaveBeenCalledOnce();
  expect(f.releaseSource).toHaveBeenCalledOnce();
  expect(f.reservation.release).toHaveBeenCalledOnce();
});

it('aggregates camera ownership without placing a resource lease in the render payload', () => {
  const f = setup();
  const release = vi.fn();
  const camera = {
    allocationBytes: 12,
    representedMediaTime: 0.4,
    generation: 3,
    source: { width: 2, height: 4 },
    placement: { x: 0, y: 0, width: 0.2, height: 0.4 },
    drawable: {
      orientation: { rotation: 90 as const, flip: true },
      draw: vi.fn(),
      prepare: vi.fn(async () => {}),
    },
    release,
  };
  const aggregate = captures.attachReviewPreviewCamera(f.captured, camera);
  expect(aggregate.value.source).toBe(f.captured.value.source);
  expect(aggregate.value.camera?.drawable).toBe(camera.drawable);
  expect(aggregate.value.camera).not.toHaveProperty('release');
  expect(aggregate.value.camera).not.toHaveProperty('allocationBytes');
  expect(f.raw.close).not.toHaveBeenCalled();
  aggregate.release();
  aggregate.release();
  expect(release).toHaveBeenCalledOnce();
  expect(f.raw.close).toHaveBeenCalledOnce();
  expect(f.reservation.release).toHaveBeenCalledOnce();
});

it('captures owned RGB without claiming source PTS when VideoFrame is absent', () => {
  const f = setup();
  f.captured.release();
  f.reserveSource.mockClear();
  f.reservation.release.mockClear();
  vi.stubGlobal('VideoFrame', undefined);
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }) };
  vi.stubGlobal('document', { createElement: () => canvas });
  const video = {
    ...f.video,
    videoWidth: 80,
    videoHeight: 40,
    readyState: 2,
    seeking: false,
  } as HTMLVideoElement;
  const captured = captureReviewPreviewFrame({
    video,
    description: f.description,
    sequence: 1,
    time: 12,
    transition: null,
    sourceTime: () => 15,
    reserveSource: f.reserveSource,
    captureCamera: () => undefined,
  });
  expect(captured).not.toBeNull();
  expect(f.reserveSource).toHaveBeenCalledWith(80 * 40 * 4);
  expect(captured!.value.source.videoFrame).toBeUndefined();
  expect(captured!.value.source.timestamp).toBeUndefined();
  expect(captured!.value.sourceTime).toBe(15);
  expect(captured!.value.resultTime).toBe(12);
  const drawImage = vi.fn();
  captured!.value.source.draw({ drawImage } as unknown as CanvasRenderingContext2D, 0, 0, 80, 40);
  const image = drawImage.mock.calls[0]![0] as HTMLCanvasElement;
  expect(image.width).toBe(80);
  captured!.release();
  captured!.release();
  expect(image.width).toBe(0);
  expect(f.reservation.release).toHaveBeenCalledOnce();
});

it.each(['budget', 'context', 'camera'] as const)(
  'rolls back absent-API RGB primary %s failure',
  (failure) => {
    const f = setup();
    f.captured.release();
    f.reservation.release.mockClear();
    vi.stubGlobal('VideoFrame', undefined);
    const rgb = {
      width: 0,
      height: 0,
      getContext: () => (failure === 'context' ? null : { drawImage: vi.fn() }),
    };
    vi.stubGlobal('document', { createElement: () => rgb });
    if (failure === 'budget')
      f.reserveSource.mockImplementationOnce(() => {
        throw new Error('budget refused');
      });
    expect(() =>
      captureReviewPreviewFrame({
        video: {
          ...f.video,
          videoWidth: 80,
          videoHeight: 40,
          readyState: 2,
          seeking: false,
        } as HTMLVideoElement,
        description: f.description,
        sequence: 1,
        time: 12,
        transition: null,
        sourceTime: () => 15,
        reserveSource: f.reserveSource,
        captureCamera: () => {
          throw new Error('camera unavailable');
        },
      })
    ).toThrow();
    expect(rgb.width).toBe(0);
    expect(f.reservation.release).toHaveBeenCalledTimes(failure === 'budget' ? 0 : 1);
  }
);

it.each(['metadata', 'seeking'] as const)('keeps absent-API RGB pending during %s', (state) => {
  const f = setup();
  f.captured.release();
  f.reserveSource.mockClear();
  vi.stubGlobal('VideoFrame', undefined);
  const rgb = { width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }) };
  vi.stubGlobal('document', { createElement: () => rgb });
  const video = {
    ...f.video,
    videoWidth: 80,
    videoHeight: 40,
    readyState: state === 'metadata' ? 1 : 2,
    seeking: state === 'seeking',
  } as HTMLVideoElement;
  const captureCamera = vi.fn();
  expect(
    captureReviewPreviewFrame({
      video,
      description: f.description,
      sequence: 1,
      time: 12,
      transition: null,
      sourceTime: () => 15,
      reserveSource: f.reserveSource,
      captureCamera,
    })
  ).toBeNull();
  expect(f.reserveSource).not.toHaveBeenCalled();
  expect(captureCamera).not.toHaveBeenCalled();
});
