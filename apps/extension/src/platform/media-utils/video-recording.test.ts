import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  VideoOutputCodec,
  VideoOutputContainer,
  VideoQuality,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  applyVideoRecordingOutputConstraints,
  buildVideoMediaRecorderOptions,
  resolveVideoRecordingArtifact,
} from './video-recording';
import { createConfigurableVideoStream } from '../../offscreen/recording/multi-source/media-stream.test-support';

function createSettings() {
  return {
    output: {
      codec: VideoOutputCodec.VP9,
      container: VideoOutputContainer.WEBM,
      resolution: VideoResolutionPreset.P1080,
    },
    quality: VideoQuality.HIGH,
  };
}

function createStream(props?: {
  applyConstraints?: (constraints?: MediaTrackConstraints) => Promise<void>;
  hasAudio?: boolean;
  resizeModes?: string[];
  settings?: MediaTrackSettings;
}): MediaStream {
  return createConfigurableVideoStream({
    applyConstraints: props?.applyConstraints ?? vi.fn(async () => undefined),
    resizeModes: props?.resizeModes ?? [],
    settings: props?.settings ?? { frameRate: 60, height: 500, width: 1086 },
    ...(props?.hasAudio === undefined ? {} : { hasAudio: props.hasAudio }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('video recording options', () => {
  it('maps actual recorder MIME types to canonical artifact containers', () => {
    expect(resolveVideoRecordingArtifact('video/webm;codecs=vp9,opus')).toEqual({
      extension: 'webm',
      mimeType: 'video/webm',
    });
    expect(resolveVideoRecordingArtifact('video/mp4;codecs=avc1.640028,mp4a.40.2')).toEqual({
      extension: 'mp4',
      mimeType: 'video/mp4',
    });
    expect(() => resolveVideoRecordingArtifact('video/custom')).toThrow(
      'Unsupported recorded video MIME type'
    );
  });

  it('uses the exact selected codec and the canonical bitrate ladder', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: vi.fn((mimeType: string) => mimeType === 'video/webm;codecs=vp9,opus'),
    });

    expect(
      buildVideoMediaRecorderOptions(
        createSettings(),
        createStream({
          hasAudio: true,
          settings: { frameRate: 30, height: 1080, width: 1920 },
        })
      )
    ).toEqual({
      mimeType: 'video/webm;codecs=vp9,opus',
      videoBitsPerSecond: 8_000_000,
    });
  });

  it('rejects an unsupported pair instead of crossing codec or container families', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: vi.fn(() => false) });

    expect(() => buildVideoMediaRecorderOptions(createSettings(), createStream())).toThrow(
      'selected recording container and codec are not supported'
    );
  });

  it.each([
    [{ frameRate: 30, height: 1080 }, 'width'],
    [{ frameRate: 30, height: 0, width: 1920 }, 'height'],
    [{ frameRate: Number.NaN, height: 1080, width: 1920 }, 'frameRate'],
  ])('rejects non-authoritative encoder metadata %o', (trackSettings, missingKey) => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: vi.fn(() => true) });

    expect(() =>
      buildVideoMediaRecorderOptions(createSettings(), createStream({ settings: trackSettings }))
    ).toThrow(`Recording video track ${missingKey} is unavailable`);
  });
});

describe('video recording output constraints', () => {
  it('uses the selected short edge without changing the source aspect ratio', async () => {
    const trackSettings: MediaTrackSettings = { frameRate: 60, height: 500, width: 1086 };
    const applyConstraints = vi.fn(async () => {
      trackSettings.frameRate = 30;
      trackSettings.height = 1080;
      trackSettings.width = 2346;
    });

    await applyVideoRecordingOutputConstraints(
      createStream({ applyConstraints, resizeModes: ['crop-and-scale'], settings: trackSettings }),
      createSettings()
    );

    expect(applyConstraints).toHaveBeenCalledWith({
      frameRate: { ideal: 30, max: 30 },
      height: { ideal: 1080, max: 1080 },
      resizeMode: 'crop-and-scale',
      width: { ideal: 2346, max: 2346 },
    });
  });

  it('rejects a browser track that silently ignores the selected output dimensions', async () => {
    await expect(
      applyVideoRecordingOutputConstraints(
        createStream({ applyConstraints: vi.fn(async () => undefined) }),
        createSettings()
      )
    ).rejects.toThrow('selected recording resolution was not applied');
  });

  it('accepts a lower physical source frame rate after applying the selected ceiling', async () => {
    const trackSettings: MediaTrackSettings = { frameRate: 60, height: 500, width: 1086 };
    const applyConstraints = vi.fn(async () => {
      trackSettings.frameRate = 24;
      trackSettings.height = 1080;
      trackSettings.width = 2346;
    });

    await expect(
      applyVideoRecordingOutputConstraints(
        createStream({ applyConstraints, settings: trackSettings }),
        createSettings()
      )
    ).resolves.toBeUndefined();
  });

  it('rejects an applied frame rate above the selected ceiling', async () => {
    const trackSettings: MediaTrackSettings = { frameRate: 60, height: 500, width: 1086 };
    const applyConstraints = vi.fn(async () => {
      trackSettings.frameRate = 60;
      trackSettings.height = 1080;
      trackSettings.width = 2346;
    });

    await expect(
      applyVideoRecordingOutputConstraints(
        createStream({ applyConstraints, settings: trackSettings }),
        createSettings()
      )
    ).rejects.toThrow('frame-rate ceiling was not applied');
  });
});
