import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStream } from '../multi-source/media-stream.test-support';
import { createRecordingStagingCoordinatorTestDouble } from './artifact-session.test-support';

const outputs = vi.hoisted(
  () =>
    [] as Array<{
      cancel: ReturnType<typeof vi.fn>;
      start: ReturnType<typeof vi.fn>;
    }>
);
const nativeSources = vi.hoisted(
  () =>
    [] as Array<{
      close: ReturnType<typeof vi.fn>;
    }>
);

vi.mock('mediabunny', () => ({
  AppendOnlyStreamTarget: class {
    constructor(readonly stream: WritableStream<Uint8Array>) {}
  },
  MediaStreamAudioTrackSource: class {},
  Mp4OutputFormat: class {},
  Output: class {
    readonly cancel = vi.fn().mockResolvedValue(undefined);
    readonly finalize = vi.fn().mockResolvedValue(undefined);
    readonly start = vi.fn().mockRejectedValue(new Error('output start failed'));
    constructor() {
      outputs.push(this);
    }
    addAudioTrack() {}
    addVideoTrack() {}
  },
  VideoSampleSource: class {},
  WebMOutputFormat: class {},
  canEncodeAudio: vi.fn().mockResolvedValue(true),
  canEncodeVideo: vi.fn().mockResolvedValue(true),
}));

vi.mock('./live-native-video-encoder-source', () => ({
  LiveNativeVideoEncoderSource: class {
    readonly add = vi.fn();
    readonly close = vi.fn();
    readonly finalize = vi.fn().mockResolvedValue(undefined);
    readonly packetSource = {};
    constructor() {
      nativeSources.push(this);
    }
  },
}));

import { createLiveRecordingArtifactSession } from './live-artifact-session';

beforeEach(() => {
  vi.clearAllMocks();
  nativeSources.length = 0;
  outputs.length = 0;
  vi.stubGlobal('VideoEncoder', {
    isConfigSupported: vi.fn().mockResolvedValue({ config: {}, supported: true }),
  });
  vi.stubGlobal(
    'MediaStreamTrackProcessor',
    class {
      readonly readable = new ReadableStream<VideoFrame>();
    }
  );
});

describe('native live video session lifecycle', () => {
  it('closes the native encoder when output startup fails outside the video pump', async () => {
    const coordinator = createRecordingStagingCoordinatorTestDouble();
    const session = await createLiveRecordingArtifactSession({
      artifactId: 'recording-1',
      coordinator,
      encoding: {
        audioBitrate: 128_000,
        audioCodec: 'opus',
        container: 'webm',
        frameRate: 30,
        videoBitrate: 8_000_000,
        videoCodec: 'vp9',
      },
      filename: 'recording.webm',
      frameTransform: {
        fit: 'fill',
        outputSize: { height: 1080, width: 2120 },
        sourceRect: { height: 1304, width: 2560, x: 0, y: 0 },
      },
      mimeType: 'video/webm',
      stream: createStream(2560, 1304),
    });
    const failed = vi.fn();
    session.setLifecycleCallbacks({ onFailure: failed });

    session.start();
    await vi.waitFor(() => expect(failed).toHaveBeenCalledOnce());

    expect(outputs[0]?.start).toHaveBeenCalledOnce();
    expect(outputs[0]?.cancel).toHaveBeenCalledOnce();
    expect(nativeSources[0]?.close).toHaveBeenCalledOnce();
    await expect(session.stop()).rejects.toThrow('output start failed');
    expect(coordinator.abort).toHaveBeenCalledOnce();
  });
});
