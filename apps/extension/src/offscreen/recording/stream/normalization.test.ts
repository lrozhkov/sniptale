// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createRecordingVideoElementMock,
  startCanvasBackedFrameLoopMock,
  waitForVideoReadyMock,
  wrapCanvasTrackStopMock,
} = vi.hoisted(() => ({
  createRecordingVideoElementMock: vi.fn(),
  startCanvasBackedFrameLoopMock: vi.fn(),
  waitForVideoReadyMock: vi.fn(),
  wrapCanvasTrackStopMock: vi.fn(),
}));

vi.mock('./viewport/video', () => ({
  createRecordingVideoElement: createRecordingVideoElementMock,
  startCanvasBackedFrameLoop: startCanvasBackedFrameLoopMock,
  startVideoBackedFrameLoop: vi.fn(),
  waitForVideoReady: waitForVideoReadyMock,
  wrapCanvasTrackStop: wrapCanvasTrackStopMock,
}));

import { normalizeRecordingStreamDimensions } from './normalization';
import { resolveRightEdgePaddingFromSample } from '../edge-padding';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';

function createCanvasFixture(stream: MediaStream) {
  const ctx = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => createEdgeImageData({ padding: 0 })),
  };
  const canvas = {
    width: 0,
    height: 0,
    captureStream: vi.fn(() => stream),
    getContext: vi.fn(() => ctx),
  };

  return { canvas, ctx };
}

function createEdgeImageData(params: { padding: number; neighborLuma?: number }) {
  const width = 5;
  const height = 4;
  const data = new Uint8ClampedArray(width * height * 4);
  const contentRightEdge = width - params.padding - 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const luma = x > contentRightEdge ? 0 : (params.neighborLuma ?? 237);
      data[offset] = luma;
      data[offset + 1] = luma;
      data[offset + 2] = luma;
      data[offset + 3] = 255;
    }
  }

  return { data, height, width };
}

function createSourceStream(audioTrack = { id: 'audio-track' }) {
  return {
    getAudioTracks: () => [audioTrack],
  } as unknown as MediaStream;
}

function createVideoFixture(overrides: Partial<HTMLVideoElement> = {}) {
  return {
    videoWidth: 1280,
    videoHeight: 720,
    pause: vi.fn(),
    srcObject: { stream: true },
    ...overrides,
  } as unknown as HTMLVideoElement;
}

function installCanvasElementMock(canvas: HTMLCanvasElement): void {
  const originalCreateElement = document.createElement.bind(document);

  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'canvas') {
      return canvas;
    }

    return originalCreateElement(tagName);
  });
}

function resetNormalizationTestState() {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    startCanvasBackedFrameLoopMock.mockReturnValue(vi.fn());
    waitForVideoReadyMock.mockResolvedValue(undefined);
  });
}

async function verifiesOddDirectStreamNormalization() {
  const normalizedStream = {
    addTrack: vi.fn(),
    getVideoTracks: () => [{} as MediaStreamTrack],
  } as unknown as MediaStream;
  const { canvas, ctx } = createCanvasFixture(normalizedStream);

  installCanvasElementMock(canvas as never);
  createRecordingVideoElementMock.mockReturnValue(
    createVideoFixture({ videoWidth: 1365, videoHeight: 767 })
  );

  await expect(
    normalizeRecordingStreamDimensions(createSourceStream(), VideoQuality.HIGH)
  ).resolves.toBe(normalizedStream);

  expect(canvas.width).toBe(1364);
  expect(canvas.height).toBe(766);
  expect(normalizedStream.addTrack).toHaveBeenCalledWith({ id: 'audio-track' });
  expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1364, 766, 0, 0, 1364, 766);
}

async function verifiesEvenDirectStreamPassthrough() {
  const sourceStream = createSourceStream();

  createRecordingVideoElementMock.mockReturnValue(
    createVideoFixture({ videoWidth: 1280, videoHeight: 720 })
  );

  await expect(normalizeRecordingStreamDimensions(sourceStream, VideoQuality.HIGH)).resolves.toBe(
    sourceStream
  );

  expect(startCanvasBackedFrameLoopMock).not.toHaveBeenCalled();
}

async function verifiesRightEdgePaddingCrop() {
  const normalizedStream = {
    addTrack: vi.fn(),
    getVideoTracks: () => [{} as MediaStreamTrack],
  } as unknown as MediaStream;
  const { canvas, ctx } = createCanvasFixture(normalizedStream);

  ctx.getImageData.mockReturnValue(createEdgeImageData({ padding: 2 }));
  installCanvasElementMock(canvas as never);
  createRecordingVideoElementMock.mockReturnValue(
    createVideoFixture({ videoWidth: 2560, videoHeight: 1304 })
  );

  await expect(
    normalizeRecordingStreamDimensions(createSourceStream(), VideoQuality.HIGH)
  ).resolves.toBe(normalizedStream);

  expect(canvas.width).toBe(2558);
  expect(canvas.height).toBe(1304);
  expect(normalizedStream.addTrack).toHaveBeenCalledWith({ id: 'audio-track' });
  expect(ctx.drawImage).toHaveBeenLastCalledWith(
    expect.anything(),
    0,
    0,
    2558,
    1304,
    0,
    0,
    2558,
    1304
  );
}

function verifiesRightEdgePaddingSampleDetection() {
  expect(resolveRightEdgePaddingFromSample(createEdgeImageData({ padding: 2 }))).toBe(2);
  expect(resolveRightEdgePaddingFromSample(createEdgeImageData({ padding: 0 }))).toBe(0);
  expect(
    resolveRightEdgePaddingFromSample(createEdgeImageData({ padding: 2, neighborLuma: 8 }))
  ).toBe(0);
}

function runViewportNormalizationSuite() {
  resetNormalizationTestState();

  it(
    'wraps odd direct tab streams in a codec-safe canvas stream',
    verifiesOddDirectStreamNormalization
  );
  it(
    'returns even direct tab streams without a canvas wrapper',
    verifiesEvenDirectStreamPassthrough
  );
  it('crops narrow right-edge tab capture padding before recording', verifiesRightEdgePaddingCrop);
  it('detects only narrow right-edge padding with visible content beside it', () => {
    verifiesRightEdgePaddingSampleDetection();
  });
}

describe('offscreen-recording-stream.viewport normalization', runViewportNormalizationSuite);
