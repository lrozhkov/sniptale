import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRecordingStagingCoordinatorTestDouble } from './artifact-session.test-support';
import {
  createConfigurableVideoStream,
  createEmptyStream,
} from '../multi-source/media-stream.test-support';

const mediabunny = vi.hoisted(() => {
  class AppendOnlyStreamTarget {
    readonly writer: WritableStreamDefaultWriter<Uint8Array>;
    constructor(stream: WritableStream<Uint8Array>) {
      this.writer = stream.getWriter();
    }
  }

  class TrackSource {
    readonly errorPromise = new Promise<never>(() => undefined);
    readonly pause = vi.fn();
    readonly resume = vi.fn();
  }

  class VideoSample {
    static instances: VideoSample[] = [];
    readonly close: ReturnType<typeof vi.fn>;
    constructor(
      readonly frame: VideoFrame,
      readonly init: { timestamp: number }
    ) {
      this.close = vi.fn(() => frame.close());
      VideoSample.instances.push(this);
    }
  }

  class VideoSampleSource {
    frameRate: number | null = null;
    configured = false;
    readonly add = vi.fn(async (sample: VideoSample) => {
      if (!this.configured) {
        this.configured = true;
        this.config.onEncoderConfig?.({
          alpha: 'discard',
          bitrate: this.config.bitrate,
          bitrateMode: Output.encoderBitrateMode ?? this.config.bitrateMode,
          codec: this.config.fullCodecString ?? 'avc1.640033',
          contentHint: Output.encoderContentHint ?? this.config.contentHint,
          displayHeight: 1304,
          displayWidth: 2560,
          framerate: Output.encoderFrameRate ?? this.frameRate ?? 60,
          hardwareAcceleration: this.config.hardwareAcceleration,
          height: 1304,
          latencyMode: this.config.latencyMode,
          width: 2560,
          avc: { format: 'avc' },
        });
      }
      this.config.onEncodedPacket?.({
        duration: 1 / (this.frameRate ?? 60),
        timestamp: sample.init.timestamp,
      });
    });
    constructor(
      readonly config: {
        bitrate: number;
        bitrateMode: VideoEncoderBitrateMode;
        contentHint: string;
        fullCodecString?: string;
        hardwareAcceleration: HardwareAcceleration;
        latencyMode: LatencyMode;
        onEncodedPacket?(packet: { duration: number; timestamp: number }): void;
        onEncoderConfig?(config: VideoEncoderConfig): void;
      }
    ) {}
  }

  class MediaStreamAudioTrackSource extends TrackSource {}

  class Output {
    static instances: Output[] = [];
    static encoderFrameRate: number | null = null;
    static encoderBitrateMode: VideoEncoderBitrateMode | null = null;
    static encoderContentHint: string | null = null;
    readonly cancel = vi.fn().mockResolvedValue(undefined);
    readonly finalize = vi.fn(async () => {
      await this.target.writer.close();
    });
    readonly start = vi.fn(async () => {
      await this.target.writer.write(new Uint8Array([1, 2, 3]));
    });
    videoMetadata: { frameRate?: number } | null = null;
    videoSource: VideoSampleSource | null = null;

    constructor(readonly input: { target: AppendOnlyStreamTarget }) {
      this.target = input.target;
      Output.instances.push(this);
    }

    readonly target: AppendOnlyStreamTarget;

    addVideoTrack(source: VideoSampleSource, metadata: { frameRate?: number }) {
      this.videoSource = source;
      this.videoMetadata = metadata;
      source.frameRate = metadata.frameRate ?? null;
    }

    addAudioTrack() {}
  }

  return {
    AppendOnlyStreamTarget,
    MediaStreamAudioTrackSource,
    Mp4OutputFormat: class {},
    Output,
    VideoSample,
    VideoSampleSource,
    WebMOutputFormat: class {},
    canEncodeAudio: vi.fn().mockResolvedValue(true),
  };
});

vi.mock('mediabunny', () => mediabunny);

import { createLiveRecordingArtifactSession } from './live-artifact-session';

function createStream(audio = false, contentHint = ''): MediaStream {
  const stream = createConfigurableVideoStream({
    hasAudio: audio,
    settings: { frameRate: 60, height: 1304, width: 2560 },
  });
  stream.getVideoTracks()[0]!.contentHint = contentHint;
  return stream;
}

async function createSession(
  options: {
    audio?: boolean;
    container?: 'mp4' | 'webm';
    contentHint?: string;
    exactAvc?: boolean;
    frameCrop?: { x: number; y: number; width: number; height: number };
    videoCodec?: 'avc' | 'vp9';
  } = {}
) {
  const coordinator = createRecordingStagingCoordinatorTestDouble();
  const session = await createLiveRecordingArtifactSession({
    artifactId: 'recording-1',
    coordinator,
    encoding: {
      audioBitrate: 128_000,
      audioCodec: options.container === 'webm' ? 'opus' : 'aac',
      container: options.container ?? 'mp4',
      frameRate: 60,
      videoBitrate: 24_000_000,
      videoCodec: options.videoCodec ?? 'avc',
      ...(options.exactAvc ? { videoCodecString: 'avc1.640033' } : {}),
    },
    filename: options.container === 'webm' ? 'recording.webm' : 'recording.mp4',
    ...(options.frameCrop ? { frameCrop: options.frameCrop } : {}),
    mimeType: options.container === 'webm' ? 'video/webm' : 'video/mp4',
    stream: createStream(options.audio, options.contentHint),
  });
  return { coordinator, session };
}

function createTestVideoFrame(timestamp: number): VideoFrame {
  return new VideoFrame(new Uint8Array(4), {
    codedHeight: 1,
    codedWidth: 1,
    format: 'RGBA',
    timestamp,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mediabunny.Output.instances.length = 0;
  mediabunny.VideoSample.instances.length = 0;
  mediabunny.Output.encoderFrameRate = null;
  mediabunny.Output.encoderBitrateMode = null;
  mediabunny.Output.encoderContentHint = null;
  vi.stubGlobal(
    'VideoFrame',
    class {
      readonly close = vi.fn();
      readonly displayHeight: number;
      readonly displayWidth: number;
      readonly duration: number | undefined;
      readonly timestamp: number;
      readonly visibleRect: DOMRectReadOnly | undefined;
      constructor(data: Uint8Array | VideoFrame, init: VideoFrameBufferInit | VideoFrameInit) {
        this.timestamp = init.timestamp ?? 0;
        this.duration = init.duration ?? undefined;
        const source = data as VideoFrame;
        this.displayWidth = init.displayWidth ?? source.displayWidth ?? 1;
        this.displayHeight = init.displayHeight ?? source.displayHeight ?? 1;
        this.visibleRect = init.visibleRect
          ? ({
              height: init.visibleRect.height,
              width: init.visibleRect.width,
              x: init.visibleRect.x,
              y: init.visibleRect.y,
            } as DOMRectReadOnly)
          : (source.visibleRect ?? undefined);
      }
    }
  );
  vi.stubGlobal('VideoEncoder', {
    isConfigSupported: vi.fn().mockResolvedValue({ config: {}, supported: true }),
  });
  vi.stubGlobal(
    'MediaStreamTrackProcessor',
    class {
      readonly readable = new ReadableStream<VideoFrame>({
        start(controller) {
          controller.enqueue(createTestVideoFrame(0));
        },
      });
    }
  );
});

describe('source-driven live recording flow', () => {
  it('passes selected 60 FPS to WebCodecs metadata without sampling or manufacturing frames', async () => {
    const { session } = await createSession();
    const started = vi.fn();
    session.setLifecycleCallbacks({ onStart: started });

    session.start();
    await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());

    const output = mediabunny.Output.instances[0];
    expect(output?.videoMetadata).toEqual({ frameRate: 60 });
    expect(output?.videoSource?.config).toEqual(
      expect.objectContaining({
        bitrate: 24_000_000,
        bitrateMode: 'constant',
        codec: 'avc',
        contentHint: 'detail',
        latencyMode: 'quality',
      })
    );
    expect(output?.videoSource?.add).toHaveBeenCalledOnce();
  });

  it('crops encoder input frames without a canvas stream when a full-tab source has odd bounds', async () => {
    const { session } = await createSession({
      exactAvc: true,
      frameCrop: { x: 0, y: 0, width: 2560, height: 1304 },
    });
    const started = vi.fn();
    session.setLifecycleCallbacks({ onStart: started });

    session.start();
    await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());

    const sample = mediabunny.VideoSample.instances[0];
    expect(sample?.frame).toEqual(
      expect.objectContaining({
        displayHeight: 1304,
        displayWidth: 2560,
        visibleRect: expect.objectContaining({ height: 1304, width: 2560, x: 0, y: 0 }),
      })
    );
    expect(mediabunny.Output.instances[0]?.videoSource?.config.onEncoderConfig).toBeDefined();
  });

  it('publishes started only after the first encoded video packet', async () => {
    const { session } = await createSession();
    const source = mediabunny.Output.instances[0]!.videoSource!;
    source.add.mockResolvedValueOnce(undefined);
    const started = vi.fn();
    session.setLifecycleCallbacks({ onStart: started });

    session.start();
    await vi.waitFor(() => expect(source.add).toHaveBeenCalledOnce());
    expect(started).not.toHaveBeenCalled();

    source.config.onEncodedPacket?.({ duration: 1 / 60, timestamp: 0 });
    await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());
    await session.abort();
  });

  it('verifies the exact AVC configuration produced by the live encoder', async () => {
    const { session } = await createSession({ exactAvc: true });
    const started = vi.fn();
    session.setLifecycleCallbacks({ onStart: started });

    session.start();
    await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());

    expect(mediabunny.Output.instances[0]?.videoSource?.config).toEqual(
      expect.objectContaining({
        fullCodecString: 'avc1.640033',
        bitrateMode: 'constant',
        hardwareAcceleration: 'no-preference',
        latencyMode: 'quality',
      })
    );
    await session.abort();
  });

  it('preserves the source track text hint through the live encoder', async () => {
    const { session } = await createSession({ contentHint: 'text', exactAvc: true });
    const started = vi.fn();
    session.setLifecycleCallbacks({ onStart: started });

    session.start();
    await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());

    expect(mediabunny.Output.instances[0]?.videoSource?.config.contentHint).toBe('text');
    await session.abort();
  });

  it('releases a start waiting for its first encoded packet when aborted', async () => {
    const { session } = await createSession();
    const output = mediabunny.Output.instances[0]!;
    output.videoSource!.add.mockResolvedValueOnce(undefined);
    session.start();
    await vi.waitFor(() => expect(output.videoSource!.add).toHaveBeenCalledOnce());

    await session.abort();

    await expect(session.stop()).rejects.toThrow('was aborted');
    expect(output.cancel).toHaveBeenCalledOnce();
  });

  it('streams bytes into staging before exactly-once finalization', async () => {
    const { session } = await createSession();
    session.start();
    await vi.waitFor(() => expect(session.state).toBe('recording'));

    const first = session.stop();
    const second = session.stop();
    const [artifact] = await Promise.all([first, second]);

    expect(artifact.size).toBe(3);
    expect(mediabunny.Output.instances[0]?.finalize).toHaveBeenCalledOnce();
  });

  it('awaits encoder backpressure and submits every real source frame without queue drops', async () => {
    const read = vi.fn();
    const timestamps = [0, 16_667, 33_334];
    vi.stubGlobal(
      'MediaStreamTrackProcessor',
      class {
        readonly readable = new ReadableStream<VideoFrame>(
          {
            pull(controller) {
              read();
              const timestamp = timestamps.shift();
              if (timestamp !== undefined) controller.enqueue(createTestVideoFrame(timestamp));
            },
          },
          { highWaterMark: 0 }
        );
      }
    );
    const { session } = await createSession();
    const source = mediabunny.Output.instances[0]!.videoSource!;
    let releaseFirstAdd!: () => void;
    source.add
      .mockImplementationOnce(() => new Promise<void>((resolve) => (releaseFirstAdd = resolve)))
      .mockResolvedValue(undefined);

    session.start();
    await vi.waitFor(() => expect(source.add).toHaveBeenCalledOnce());
    expect(read).toHaveBeenCalledOnce();
    releaseFirstAdd();
    await vi.waitFor(() => expect(source.add).toHaveBeenCalledTimes(3));

    expect(read).toHaveBeenCalledTimes(4);
    expect(mediabunny.VideoSample.instances).toHaveLength(3);
    expect(
      mediabunny.VideoSample.instances.every((sample) => sample.close.mock.calls.length === 1)
    ).toBe(true);
    await session.abort();
  });

  it('rejects finalization when an in-flight video encode fails during stop', async () => {
    const timestamps = [0, 16_667];
    vi.stubGlobal(
      'MediaStreamTrackProcessor',
      class {
        readonly readable = new ReadableStream<VideoFrame>(
          {
            pull(controller) {
              const timestamp = timestamps.shift();
              if (timestamp !== undefined) controller.enqueue(createTestVideoFrame(timestamp));
            },
          },
          { highWaterMark: 0 }
        );
      }
    );
    const { coordinator, session } = await createSession();
    const output = mediabunny.Output.instances[0]!;
    const source = output.videoSource!;
    const encodeFirst = source.add.getMockImplementation()!;
    let rejectSecondEncode!: (error: Error) => void;
    source.add
      .mockImplementationOnce(encodeFirst)
      .mockImplementationOnce(
        () => new Promise<void>((_resolve, reject) => (rejectSecondEncode = reject))
      );
    session.start();
    await vi.waitFor(() => expect(session.state).toBe('recording'));
    await vi.waitFor(() => expect(source.add).toHaveBeenCalledTimes(2));
    const error = new Error('encoder failed during stop');

    const stopping = session.stop();
    rejectSecondEncode(error);

    await expect(stopping).rejects.toBe(error);
    expect(output.finalize).not.toHaveBeenCalled();
    expect(coordinator.abort).toHaveBeenCalledOnce();
  });
});

describe('source-driven live recording lifecycle and capability failures', () => {
  it('pauses and resumes all source-driven capture through one session authority', async () => {
    const { session } = await createSession();
    session.start();
    await vi.waitFor(() => expect(session.state).toBe('recording'));
    const audioSource = mediabunny.Output.instances[0]?.videoSource;

    session.pause();
    expect(session.state).toBe('paused');
    session.resume();
    expect(session.state).toBe('recording');
    expect(audioSource?.add).toHaveBeenCalledOnce();
  });

  it('uses append-only WebM and checks the configured audio encoder when audio is present', async () => {
    const { session } = await createSession({ audio: true, container: 'webm' });
    session.start();
    await vi.waitFor(() => expect(session.state).toBe('recording'));

    expect(mediabunny.canEncodeAudio).toHaveBeenCalledWith('opus', { bitrate: 128_000 });
    session.pause();
    session.resume();
    await expect(session.stop()).resolves.toEqual(expect.objectContaining({ size: 3 }));
  });

  it('rejects the terminal session when WebCodecs drops the selected frame-rate configuration', async () => {
    mediabunny.Output.encoderFrameRate = 30;
    const { coordinator, session } = await createSession();
    const onFailure = vi.fn();
    session.setLifecycleCallbacks({ onFailure });

    session.start();
    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledOnce());

    await expect(session.stop()).rejects.toThrow('did not preserve requested 60 FPS');
    expect(coordinator.abort).toHaveBeenCalledOnce();
    expect(mediabunny.Output.instances[0]?.cancel).toHaveBeenCalledOnce();
  });

  it('rejects variable bitrate drift for VP9 without an exact codec string', async () => {
    mediabunny.Output.encoderBitrateMode = 'variable';
    const { coordinator, session } = await createSession({ container: 'webm', videoCodec: 'vp9' });
    const onFailure = vi.fn();
    session.setLifecycleCallbacks({ onFailure });

    session.start();
    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledOnce());

    await expect(session.stop()).rejects.toThrow('did not preserve constant bitrate mode');
    expect(coordinator.abort).toHaveBeenCalledOnce();
  });

  it('rejects encoder content-hint drift without an exact codec string', async () => {
    mediabunny.Output.encoderContentHint = 'detail';
    const { coordinator, session } = await createSession({
      container: 'webm',
      contentHint: 'text',
      videoCodec: 'vp9',
    });
    const onFailure = vi.fn();
    session.setLifecycleCallbacks({ onFailure });

    session.start();
    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledOnce());

    await expect(session.stop()).rejects.toThrow('did not preserve source content hint');
    expect(coordinator.abort).toHaveBeenCalledOnce();
  });

  it('preserves the encoder failure when lifecycle cleanup aborts the failed session', async () => {
    mediabunny.Output.encoderFrameRate = 30;
    const { session } = await createSession();
    const failed = vi.fn();
    session.setLifecycleCallbacks({
      onFailure: () => {
        failed();
        void session.abort();
      },
    });

    session.start();
    await vi.waitFor(() => expect(failed).toHaveBeenCalledOnce());

    await expect(session.stop()).rejects.toThrow('did not preserve requested 60 FPS');
  });

  it('rejects stop before start and makes abort idempotent', async () => {
    const { coordinator, session } = await createSession();
    await expect(session.stop()).rejects.toThrow('cannot stop while ready');
    await session.abort();
    await session.abort();
    expect(coordinator.abort).toHaveBeenCalledOnce();
  });

  it('propagates publication callback failure through the terminal owner', async () => {
    const { coordinator, session } = await createSession();
    const error = new Error('publication failed');
    session.setLifecycleCallbacks({ onStop: () => Promise.reject(error) });
    session.start();
    await vi.waitFor(() => expect(session.state).toBe('recording'));

    await expect(session.stop()).rejects.toBe(error);
    expect(coordinator.abort).toHaveBeenCalledOnce();
  });

  it('fails unsupported WebCodecs configuration without constructing a recorder fallback', async () => {
    vi.mocked(VideoEncoder.isConfigSupported).mockResolvedValueOnce({
      config: {} as VideoEncoderConfig,
      supported: false,
    });
    const coordinator = createRecordingStagingCoordinatorTestDouble();

    await expect(
      createLiveRecordingArtifactSession({
        artifactId: 'recording-1',
        coordinator,
        encoding: {
          audioBitrate: 128_000,
          audioCodec: 'aac',
          container: 'mp4',
          frameRate: 60,
          videoBitrate: 24_000_000,
          videoCodec: 'avc',
          videoCodecString: 'avc1.640033',
        },
        filename: 'recording.mp4',
        mimeType: 'video/mp4',
        stream: createStream(),
      })
    ).rejects.toThrow('selected live video encoder configuration is not supported');
    expect(coordinator.abort).toHaveBeenCalledOnce();
    expect(mediabunny.Output.instances).toHaveLength(0);
  });

  it('preflights the exact selected frame rate with browser-selected acceleration', async () => {
    const isConfigSupported = vi.fn().mockResolvedValue({ config: {}, supported: true });
    vi.stubGlobal('VideoEncoder', { isConfigSupported });
    const coordinator = createRecordingStagingCoordinatorTestDouble();

    await createLiveRecordingArtifactSession({
      artifactId: 'recording-1',
      coordinator,
      encoding: {
        audioBitrate: 128_000,
        audioCodec: 'aac',
        container: 'mp4',
        frameRate: 60,
        videoBitrate: 36_000_000,
        videoCodec: 'avc',
        videoCodecString: 'avc1.640033',
      },
      filename: 'recording.mp4',
      mimeType: 'video/mp4',
      stream: createStream(false, 'text'),
    });

    expect(isConfigSupported).toHaveBeenCalledWith(
      expect.objectContaining({
        bitrate: 36_000_000,
        bitrateMode: 'constant',
        codec: 'avc1.640033',
        contentHint: 'text',
        framerate: 60,
        hardwareAcceleration: 'no-preference',
        height: 1304,
        width: 2560,
      })
    );
  });

  it('fails unsupported live audio without changing the selected container', async () => {
    mediabunny.canEncodeAudio.mockResolvedValueOnce(false);
    const coordinator = createRecordingStagingCoordinatorTestDouble();

    await expect(
      createLiveRecordingArtifactSession({
        artifactId: 'recording-1',
        coordinator,
        encoding: {
          audioBitrate: 128_000,
          audioCodec: 'opus',
          container: 'webm',
          frameRate: 60,
          videoBitrate: 24_000_000,
          videoCodec: 'vp9',
        },
        filename: 'recording.webm',
        mimeType: 'video/webm',
        stream: createStream(true),
      })
    ).rejects.toThrow('selected live audio encoder configuration is not supported');
    expect(coordinator.abort).toHaveBeenCalledOnce();
  });

  it('rejects a live session without a video track and aborts opened staging', async () => {
    const coordinator = createRecordingStagingCoordinatorTestDouble();

    await expect(
      createLiveRecordingArtifactSession({
        artifactId: 'recording-1',
        coordinator,
        encoding: {
          audioBitrate: 128_000,
          audioCodec: 'aac',
          container: 'mp4',
          frameRate: 60,
          videoBitrate: 24_000_000,
          videoCodec: 'avc',
        },
        filename: 'recording.mp4',
        mimeType: 'video/mp4',
        stream: createEmptyStream(),
      })
    ).rejects.toThrow('has no video track');
    expect(coordinator.abort).toHaveBeenCalledOnce();
  });
});
