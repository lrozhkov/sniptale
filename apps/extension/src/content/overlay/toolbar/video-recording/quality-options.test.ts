import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  VideoFrameRate,
  VideoOutputCodec,
  VideoOutputContainer,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  getToolbarQualityOptions,
  isToolbarOutputSupported,
  resolveToolbarOutputContainer,
} from './quality-options';

afterEach(() => vi.unstubAllGlobals());

it('marks only the explicitly selected matching profile and preserves custom names', () => {
  const profile = {
    id: 'user:demo',
    name: 'A long custom profile',
    configuration: { ...DEFAULT_VIDEO_SETTINGS.outputProfile },
  };
  const settings = {
    ...DEFAULT_VIDEO_SETTINGS,
    qualityProfiles: [profile],
    qualityProfileId: profile.id,
  };
  expect(
    getToolbarQualityOptions(settings)
      .filter((option) => option.selected)
      .map((option) => option.id)
  ).toEqual([profile.id]);
  expect(getToolbarQualityOptions(settings).at(-1)?.label).toBe(profile.name);
  expect(
    getToolbarQualityOptions({ ...settings, qualityProfileId: null }).some(
      (option) => option.selected
    )
  ).toBe(false);
  expect(
    getToolbarQualityOptions({
      ...settings,
      outputProfile: { ...settings.outputProfile, frameRate: VideoFrameRate.FPS24 },
    }).some((option) => option.selected)
  ).toBe(false);
});

it('refuses unsupported 4K60 and preserves a silent-only native codec', () => {
  vi.stubGlobal('MediaRecorder', { isTypeSupported: (mime: string) => !mime.includes('opus') });
  expect(isToolbarOutputSupported(DEFAULT_VIDEO_SETTINGS.outputProfile)).toBe(true);
  expect(
    isToolbarOutputSupported({
      ...DEFAULT_VIDEO_SETTINGS.outputProfile,
      resolution: VideoResolutionPreset.P2160,
      frameRate: VideoFrameRate.FPS60,
    })
  ).toBe(false);
  vi.stubGlobal('MediaRecorder', { isTypeSupported: () => false });
  expect(isToolbarOutputSupported(DEFAULT_VIDEO_SETTINGS.outputProfile)).toBe(false);
});

it('resolves a compatible container codec without changing the remaining output fields', () => {
  const current = {
    ...DEFAULT_VIDEO_SETTINGS.outputProfile,
    codec: VideoOutputCodec.AVC,
    container: VideoOutputContainer.MP4,
  };
  const result = resolveToolbarOutputContainer(current, VideoOutputContainer.WEBM);
  expect(result).toEqual({
    ...current,
    container: VideoOutputContainer.WEBM,
    codec: VideoOutputCodec.VP9,
  });
  expect(current.container).toBe(VideoOutputContainer.MP4);
});
