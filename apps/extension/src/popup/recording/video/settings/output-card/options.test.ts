import { afterEach, expect, it, vi } from 'vitest';
import {
  DEFAULT_VIDEO_OUTPUT_PROFILE,
  VideoOutputCodec,
  VideoOutputContainer,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import { getAvailableOutputCodecs, resolveOutputForContainer } from './options';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('exposes only the stable live-recording codec matrix', () => {
  vi.stubGlobal('MediaRecorder', { isTypeSupported: vi.fn(() => true) });

  expect(
    getAvailableOutputCodecs(
      VideoOutputContainer.WEBM,
      { ...DEFAULT_VIDEO_OUTPUT_PROFILE, resolution: VideoResolutionPreset.P480 },
      false
    )
  ).toEqual([VideoOutputCodec.VP9, VideoOutputCodec.VP8]);
  expect(
    getAvailableOutputCodecs(
      VideoOutputContainer.MP4,
      { ...DEFAULT_VIDEO_OUTPUT_PROFILE, resolution: VideoResolutionPreset.P480 },
      false
    )
  ).toEqual([VideoOutputCodec.AVC]);
});

it('switches WebM VP9 to the canonical MP4 AVC codec without a hidden runtime fallback', () => {
  vi.stubGlobal('MediaRecorder', { isTypeSupported: vi.fn(() => true) });

  expect(
    resolveOutputForContainer({
      container: VideoOutputContainer.MP4,
      current: {
        ...DEFAULT_VIDEO_OUTPUT_PROFILE,
        codec: VideoOutputCodec.VP9,
        container: VideoOutputContainer.WEBM,
        resolution: VideoResolutionPreset.P480,
      },
      hasAudioTracks: false,
    })
  ).toEqual({
    ...DEFAULT_VIDEO_OUTPUT_PROFILE,
    codec: VideoOutputCodec.AVC,
    container: VideoOutputContainer.MP4,
    resolution: VideoResolutionPreset.P480,
  });
});
