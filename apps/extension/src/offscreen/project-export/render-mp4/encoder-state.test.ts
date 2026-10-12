import { expect, it, vi } from 'vitest';

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    warn: vi.fn(),
  }),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../codecs', () => ({
  closeEncoderQuietly: (encoder: { close: () => void }) => encoder.close(),
  normalizeError: (error: unknown) => error,
}));

import { createMp4EncoderState } from './encoder-state';

type EncoderCallbacks = {
  error: (error: unknown) => void;
  output: (chunk: unknown, meta: unknown) => void;
};

it('captures encoder callback failures and rethrows the remembered pipeline error', () => {
  let videoEncoderConfig: EncoderCallbacks | undefined;
  let audioEncoderConfig: EncoderCallbacks | undefined;

  class VideoEncoderMock {
    configure = vi.fn();

    constructor(config: EncoderCallbacks) {
      videoEncoderConfig = config;
    }
  }

  class AudioEncoderMock {
    configure = vi.fn();

    constructor(config: EncoderCallbacks) {
      audioEncoderConfig = config;
    }
  }

  vi.stubGlobal('VideoEncoder', VideoEncoderMock as never);
  vi.stubGlobal('AudioEncoder', AudioEncoderMock as never);

  const encoderState = createMp4EncoderState({
    muxer: {
      addAudioChunk: vi.fn(),
      addVideoChunk: vi.fn(() => {
        throw new Error('video chunk failed');
      }),
    },
    videoProfile: {
      config: { codec: 'vp09.00.10.08' },
    },
    audioProfile: {
      config: { codec: 'opus' },
    },
  } as never);

  if (videoEncoderConfig) {
    videoEncoderConfig.output({ id: 'video' }, { id: 'meta' });
  }
  expect(() => encoderState.throwIfPipelineFailed()).toThrow('video chunk failed');

  if (audioEncoderConfig) {
    audioEncoderConfig.error(new Error('audio encoder failed'));
  }
  expect(encoderState.audioEncoder).not.toBeNull();
});

it('skips audio encoder setup when the pipeline has no audio profile', () => {
  let videoEncoderConfig: EncoderCallbacks | undefined;
  let audioEncoderConfig: EncoderCallbacks | undefined;

  class VideoEncoderMock {
    configure = vi.fn();

    constructor(config: EncoderCallbacks) {
      videoEncoderConfig = config;
    }
  }

  class AudioEncoderMock {
    configure = vi.fn();

    constructor(config: EncoderCallbacks) {
      audioEncoderConfig = config;
    }
  }

  vi.stubGlobal('VideoEncoder', VideoEncoderMock as never);
  vi.stubGlobal('AudioEncoder', AudioEncoderMock as never);

  const encoderState = createMp4EncoderState({
    muxer: {
      addAudioChunk: vi.fn(),
      addVideoChunk: vi.fn(),
      finalize: vi.fn(),
    },
    videoProfile: {
      config: { codec: 'vp09.00.10.08' },
    },
    audioProfile: null,
  } as never);

  expect(videoEncoderConfig).toBeDefined();
  expect(audioEncoderConfig).toBeUndefined();
  expect(encoderState.audioEncoder).toBeNull();
  expect(() => encoderState.throwIfPipelineFailed()).not.toThrow();
});

it('observes asynchronous packet failures from native encoder callbacks', async () => {
  let callbacks: EncoderCallbacks | undefined;
  vi.stubGlobal(
    'VideoEncoder',
    class {
      configure = vi.fn();
      constructor(config: EncoderCallbacks) {
        callbacks = config;
      }
    }
  );
  const failure = new Error('async muxer write failed');
  const state = createMp4EncoderState({
    audioProfile: null,
    videoProfile: { config: {} },
    muxer: { addVideoChunk: vi.fn().mockRejectedValue(failure) },
  } as never);
  callbacks!.output({ id: 'packet' }, {});
  await vi.waitFor(() => expect(() => state.throwIfPipelineFailed()).toThrow(failure));
});

it('closes both acquired encoders when audio configuration fails', () => {
  const videoClose = vi.fn();
  const audioClose = vi.fn();
  vi.stubGlobal(
    'VideoEncoder',
    class {
      configure = vi.fn();
      close = videoClose;
    }
  );
  vi.stubGlobal(
    'AudioEncoder',
    class {
      close = audioClose;
      configure() {
        throw new Error('audio configure failed');
      }
    }
  );
  expect(() =>
    createMp4EncoderState({
      videoProfile: { config: {} },
      audioProfile: { config: {} },
    } as never)
  ).toThrow('audio configure failed');
  expect(videoClose).toHaveBeenCalledOnce();
  expect(audioClose).toHaveBeenCalledOnce();
});
