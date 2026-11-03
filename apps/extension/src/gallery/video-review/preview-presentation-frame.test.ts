import { afterEach, expect, it, vi } from 'vitest';
import { captureReviewPreviewFrame } from './preview-presentation-frame';
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
  return { raw, packed, captured, sourceTime, reserveSource, reservation, video };
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
