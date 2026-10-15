import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { ReviewEdit } from '../../features/video/review/types';

vi.mock('./render-spotlight', () => ({ drawReviewSpotlights: vi.fn() }));
vi.mock('./window-header', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./window-header')>()),
  loadReviewWindowHeader: vi.fn(async () => ({ width: 1904, height: 86, close: vi.fn() })),
}));

const state = vi.hoisted(() => ({
  sourceWidth: 320,
  sourceHeight: 180,
  configurations: [] as unknown[],
  encoded: [] as {
    timestamp: number;
    duration: number;
    close: unknown;
    width: number;
    height: number;
  }[],
  composited: [] as unknown[][],
  drawn: [] as { draw: unknown; close: unknown }[],
  audioTrack: null as null | {
    codec: 'opus';
    getDecoderConfig(): Promise<AudioDecoderConfig>;
    getSampleRate(): Promise<number>;
  },
}));

vi.mock('mediabunny', async (importOriginal) => {
  const { Quality } = await importOriginal<typeof import('mediabunny')>();
  class VideoSample {
    timestamp: number;
    duration: number;
    width: number;
    height: number;
    close = vi.fn();
    draw = vi.fn();
    constructor(source: HTMLCanvasElement | null, init: { timestamp: number; duration?: number }) {
      this.timestamp = init.timestamp;
      this.duration = init.duration ?? 0;
      this.width = source?.width ?? 0;
      this.height = source?.height ?? 0;
    }
  }
  class VideoSampleSink {
    async getSample(time: number) {
      const sample = new VideoSample(null, { timestamp: Math.floor(time * 2) / 2 });
      state.drawn.push({ draw: sample.draw, close: sample.close });
      return sample;
    }
    async *samples(start: number, end: number) {
      const timestamp = Math.ceil(start * 2) / 2;
      if (timestamp >= end) return;
      const sample = new VideoSample(null, { timestamp });
      state.drawn.push({ draw: sample.draw, close: sample.close });
      yield sample;
    }
    async *samplesAtTimestamps(times: readonly number[]) {
      for (const time of times) {
        const sample = new VideoSample(null, { timestamp: time });
        state.drawn.push({ draw: sample.draw, close: sample.close });
        yield sample;
      }
    }
  }
  class Input {
    async getPrimaryVideoTrack() {
      return {
        codec: 'vp9',
        getTimeResolution: async () => 1000,
        canDecode: async () => true,
        getDisplayWidth: async () => state.sourceWidth,
        getDisplayHeight: async () => state.sourceHeight,
      };
    }
    async getPrimaryAudioTrack() {
      return state.audioTrack;
    }
    dispose(): void {}
  }
  class Output {
    start = vi.fn();
    finalize = vi.fn();
    cancel = vi.fn(async () => undefined);
    addVideoTrack = vi.fn();
    addAudioTrack = vi.fn();
    setMetadataTags = vi.fn();
  }
  class VideoSampleSource {
    constructor(config: unknown) {
      state.configurations.push(config);
    }
    add = vi.fn(async (sample: VideoSample) => {
      state.encoded.push({
        timestamp: sample.timestamp,
        duration: sample.duration,
        close: sample.close,
        width: sample.width,
        height: sample.height,
      });
    });
    close(): void {}
  }
  return {
    Quality,
    ALL_FORMATS: [],
    BlobSource: class {},
    Input,
    Output,
    StreamTarget: class {},
    Mp4OutputFormat: class {},
    WebMOutputFormat: class {},
    VideoSample,
    VideoSampleSink,
    VideoSampleSource,
    EncodedVideoPacketSource: class {},
    EncodedAudioPacketSource: class {},
    AudioSampleSource: class {},
    EncodedPacketSink: class {},
  };
});

const realDocument = globalThis.document;
const realVideoEncoder = globalThis.VideoEncoder;
const realCreateImageBitmap = globalThis.createImageBitmap;

export function contextFixture() {
  return {
    translate: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    scale: vi.fn(),
    fillStyle: '',
    globalAlpha: 1,
    font: '',
    textBaseline: '',
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 6 })),
    drawImage: vi.fn((...args: unknown[]) => state.composited.push(args)),
  } as unknown as CanvasRenderingContext2D;
}

beforeAll(() => {
  globalThis.VideoEncoder = {
    isConfigSupported: async (config: VideoEncoderConfig) => ({ config, supported: true }),
  } as unknown as typeof VideoEncoder;
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => contextFixture() }),
  } as unknown as Document;
  globalThis.createImageBitmap = (async () => {
    throw new Error('decode failed');
  }) as typeof createImageBitmap;
});

afterAll(() => {
  globalThis.document = realDocument;
  globalThis.VideoEncoder = realVideoEncoder;
  globalThis.createImageBitmap = realCreateImageBitmap;
});

afterEach(() => {
  state.encoded.length = 0;
  state.drawn.length = 0;
  state.audioTrack = null;
  state.sourceWidth = 320;
  state.sourceHeight = 180;
  vi.unstubAllGlobals();
});

function writerFixture() {
  return { writeAt: vi.fn(async () => undefined) };
}

export function argsFixture(overrides?: {
  advanced?: ReturnType<typeof createQuickEditAdvancedState>;
  processedVideoCodec?: 'avc' | 'vp8' | 'vp9' | null;
  audioCodec?: 'aac' | 'opus' | null;
  frameRate?: number;
}) {
  const advanced = overrides?.advanced ?? createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  return {
    file: new Blob(['video']),
    index: {
      duration: 2,
      boundaries: [0, 2],
      videoCodec: 'vp9' as const,
      audioCodec: overrides?.audioCodec ?? null,
      container: 'webm' as const,
      rotation: 0 as const,
      processedVideoCodec:
        overrides && overrides.processedVideoCodec !== undefined
          ? overrides.processedVideoCodec
          : ('vp9' as const),
      frameRate: overrides?.frameRate ?? 2,
    },
    edits: [] as ReviewEdit[],
    advanced,
    fragmentOffset: 0,
    writer: writerFixture(),
    signal: new AbortController().signal,
    readProjectAsset: vi.fn(async (): Promise<Blob | null> => null),
  };
}

export { state };
