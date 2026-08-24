import { describe, expect, it } from 'vitest';
import {
  createConfigurableVideoStream,
  createEmptyStream,
} from '../multi-source/media-stream.test-support';
import {
  assertLiveVideoEncoderConfig,
  buildExactVideoEncoderConfig,
  buildNativeVideoEncoderConfig,
  canUseNativeEncoderTransform,
  resolveLiveEncoderContentHint,
  resolveLiveEncodingDimensions,
  resolveLiveVideoBitrateMode,
} from './live-video-encoder-config';

const fillTransform = {
  fit: 'fill' as const,
  outputSize: { height: 1080, width: 2120 },
  sourceRect: { height: 1304, width: 2560, x: 0, y: 0 },
};

const vp9Encoding = {
  container: 'webm' as const,
  frameRate: 30,
  videoBitrate: 8_000_000,
  videoCodec: 'vp9' as const,
};

describe('live video encoder configuration', () => {
  it('selects text hints, transformed VP9 rate control, and an exact output configuration', () => {
    const stream = createConfigurableVideoStream({
      settings: { frameRate: 30, height: 1304, width: 2560 },
    });
    const track = stream.getVideoTracks()[0]!;
    track.contentHint = 'text';
    const input = { encoding: vp9Encoding, frameTransform: fillTransform, stream };
    const dimensions = resolveLiveEncodingDimensions(input);
    const contentHint = resolveLiveEncoderContentHint(track);
    const config = buildNativeVideoEncoderConfig(input, dimensions, contentHint);

    expect(resolveLiveVideoBitrateMode(input)).toBe('constant');
    expect(config).toEqual(
      expect.objectContaining({
        bitrateMode: 'constant',
        codec: 'vp09.00.50.08',
        contentHint: 'text',
        displayHeight: 1080,
        displayWidth: 2120,
        height: 1080,
        width: 2120,
      })
    );
    expect(canUseNativeEncoderTransform(fillTransform, config)).toBe(true);
    expect(() =>
      assertLiveVideoEncoderConfig({
        actual: config!,
        contentHint,
        dimensions,
        encoding: vp9Encoding,
        expected: config,
        frameTransform: fillTransform,
      })
    ).not.toThrow();
  });

  it('keeps pass-through and AVC on variable rate control', () => {
    expect(resolveLiveVideoBitrateMode({ encoding: vp9Encoding })).toBe('variable');
    expect(
      resolveLiveVideoBitrateMode({
        encoding: { ...vp9Encoding, container: 'mp4', videoCodec: 'avc' },
        frameTransform: fillTransform,
      })
    ).toBe('variable');
    expect(
      buildExactVideoEncoderConfig(
        {
          encoding: { ...vp9Encoding, container: 'mp4', videoCodec: 'avc' },
        },
        { height: 1080, width: 1920 },
        'detail'
      )
    ).toBeNull();
    expect(
      buildExactVideoEncoderConfig({ encoding: vp9Encoding }, { height: 1304, width: 2560 }, 'text')
    ).toBeNull();
  });

  it('requires aligned fill geometry for native encoder scaling', () => {
    const config = { codec: 'vp09.00.50.08', height: 1080, width: 2120 };
    expect(canUseNativeEncoderTransform(undefined, config)).toBe(false);
    expect(canUseNativeEncoderTransform({ ...fillTransform, fit: 'contain' }, config)).toBe(false);
    expect(
      canUseNativeEncoderTransform(
        { ...fillTransform, sourceRect: { ...fillTransform.sourceRect, x: 1 } },
        config
      )
    ).toBe(false);
    expect(
      canUseNativeEncoderTransform(
        { ...fillTransform, outputSize: { ...fillTransform.outputSize, width: 2119 } },
        config
      )
    ).toBe(false);
  });

  it('validates source and output geometry at the capture boundary', () => {
    const stream = createConfigurableVideoStream({
      settings: { frameRate: 30, height: 1304, width: 2560 },
    });
    expect(resolveLiveEncodingDimensions({ stream })).toEqual({ height: 1304, width: 2560 });
    expect(() =>
      resolveLiveEncodingDimensions({
        frameTransform: { ...fillTransform, outputSize: { height: 1079, width: 2120 } },
        stream,
      })
    ).toThrow('positive even dimensions');
    expect(() =>
      resolveLiveEncodingDimensions({
        frameTransform: {
          ...fillTransform,
          sourceRect: { ...fillTransform.sourceRect, width: 2562 },
        },
        stream,
      })
    ).toThrow('outside the source frame');
    expect(() => resolveLiveEncodingDimensions({ stream: createEmptyStream() })).toThrow(
      'no video track'
    );
  });

  it('rejects encoder configuration drift at each owned semantic boundary', () => {
    const base = {
      alpha: 'discard' as const,
      bitrate: 8_000_000,
      bitrateMode: 'variable' as const,
      codec: 'vp09.00.40.08',
      contentHint: 'text' as const,
      framerate: 30,
      hardwareAcceleration: 'no-preference' as const,
      height: 1080,
      latencyMode: 'quality' as const,
      width: 1920,
    };
    const input = {
      contentHint: 'text' as const,
      dimensions: { height: 1080, width: 1920 },
      encoding: vp9Encoding,
      expected: null,
    };

    expect(() => assertLiveVideoEncoderConfig({ ...input, actual: base })).not.toThrow();
    expect(() =>
      assertLiveVideoEncoderConfig({ ...input, actual: { ...base, framerate: 60 } })
    ).toThrow('frame rate');
    expect(() =>
      assertLiveVideoEncoderConfig({ ...input, actual: { ...base, bitrateMode: 'constant' } })
    ).toThrow('bitrate mode');
    expect(() =>
      assertLiveVideoEncoderConfig({ ...input, actual: { ...base, contentHint: 'motion' } })
    ).toThrow('content hint');
    expect(() =>
      assertLiveVideoEncoderConfig({ ...input, actual: { ...base, width: 1918 } })
    ).toThrow('selected video configuration');
  });
});
