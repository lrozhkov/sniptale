import { beforeEach, describe, expect, it, vi } from 'vitest';

const mediabunny = vi.hoisted(() => ({
  canEncodeAudio: vi.fn().mockResolvedValue(true),
  canEncodeVideo: vi.fn().mockResolvedValue(true),
}));

vi.mock('mediabunny', () => ({
  AppendOnlyStreamTarget: class {},
  MediaStreamAudioTrackSource: class {},
  Mp4OutputFormat: class {},
  Output: class {},
  VideoSampleSource: class {},
  WebMOutputFormat: class {},
  canEncodeAudio: mediabunny.canEncodeAudio,
  canEncodeVideo: mediabunny.canEncodeVideo,
}));

import { createLiveRecordingArtifactSession } from './live-artifact-session';
import { createRecordingStagingCoordinatorTestDouble } from './artifact-session.test-support';
import { createStream } from '../multi-source/media-stream.test-support';

beforeEach(() => {
  vi.clearAllMocks();
  mediabunny.canEncodeAudio.mockResolvedValue(true);
  mediabunny.canEncodeVideo.mockResolvedValue(true);
  vi.stubGlobal('VideoEncoder', { isConfigSupported: vi.fn() });
});

describe('source-driven live recording input validation', () => {
  it('preflights VP9 through the selected source-timed configuration', async () => {
    mediabunny.canEncodeVideo.mockResolvedValueOnce(false);
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
          videoBitrate: 12_000_000,
          videoCodec: 'vp9',
        },
        filename: 'recording.webm',
        mimeType: 'video/webm',
        stream: createStream(2560, 1304),
      })
    ).rejects.toThrow('selected live video encoder configuration is not supported');
    expect(mediabunny.canEncodeVideo).toHaveBeenCalledWith(
      'vp9',
      expect.objectContaining({
        bitrate: 12_000_000,
        contentHint: 'detail',
        height: 1304,
        width: 2560,
      })
    );
    expect(coordinator.abort).toHaveBeenCalledOnce();
  });

  it('rejects an encoder transform outside the captured source frame', async () => {
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
        frameTransform: {
          fit: 'fill',
          outputSize: { height: 1080, width: 1920 },
          sourceRect: { height: 1304, width: 2561, x: 0, y: 0 },
        },
        mimeType: 'video/mp4',
        stream: createStream(2560, 1304),
      })
    ).rejects.toThrow('source rectangle is outside the source frame');
    expect(coordinator.abort).toHaveBeenCalledOnce();
  });
});
