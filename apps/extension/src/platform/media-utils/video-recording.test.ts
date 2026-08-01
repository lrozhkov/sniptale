import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  VideoOutputCodec,
  VideoOutputContainer,
  VideoFrameRate,
  VideoQuality,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import { buildVideoMediaRecorderOptions, resolveVideoRecordingArtifact } from './video-recording';
import { createConfigurableVideoStream } from '../../offscreen/recording/multi-source/media-stream.test-support';

function createSettings() {
  return {
    outputProfile: {
      codec: VideoOutputCodec.VP9,
      container: VideoOutputContainer.WEBM,
      frameRate: VideoFrameRate.FPS30,
      quality: VideoQuality.HIGH,
      resolution: VideoResolutionPreset.P1080,
    },
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
