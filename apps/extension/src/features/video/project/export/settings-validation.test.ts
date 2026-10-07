import { describe, expect, it } from 'vitest';
import { VideoExportFormat, VideoExportQualityPreset, VideoMp4Codec } from '../types';
import { VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';
import { assertVideoProjectExportSettingsCompatibleWithProject } from './settings-validation';

const project = {
  clips: [],
  duration: 10,
  height: 984,
  width: 1902,
};

function createSettings() {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    fps: 30,
    height: 440,
    mp4VideoCodec: VideoMp4Codec.AVC,
    quality: VideoExportQualityPreset.HIGH,
    resolution: VideoResolutionPreset.P480,
    width: 854,
  };
}

describe('video project export settings validation', () => {
  it('accepts only dimensions derived from the selected source-relative preset', () => {
    expect(() =>
      assertVideoProjectExportSettingsCompatibleWithProject(project, createSettings())
    ).not.toThrow();
    expect(() =>
      assertVideoProjectExportSettingsCompatibleWithProject(project, {
        ...createSettings(),
        height: 984,
        width: 1902,
      })
    ).toThrow('Invalid video project export settings');
  });

  it('rejects an incomplete or cross-container codec contract at runtime', () => {
    expect(() =>
      assertVideoProjectExportSettingsCompatibleWithProject(project, {
        ...createSettings(),
        mp4VideoCodec: undefined,
      })
    ).toThrow('Invalid video project export settings');
  });
});

it('requires both selected-range bounds inside the project duration', () => {
  expect(() =>
    assertVideoProjectExportSettingsCompatibleWithProject(project, {
      ...createSettings(),
      scope: 'selected-range',
      rangeStartSeconds: 2,
      rangeEndSeconds: 5,
    })
  ).not.toThrow();
  for (const bounds of [
    {},
    { rangeStartSeconds: 2 },
    { rangeEndSeconds: 5 },
    { rangeStartSeconds: 5, rangeEndSeconds: 2 },
    { rangeStartSeconds: 0, rangeEndSeconds: 11 },
  ]) {
    expect(() =>
      assertVideoProjectExportSettingsCompatibleWithProject(project, {
        ...createSettings(),
        scope: 'selected-range',
        ...bounds,
      })
    ).toThrow('Invalid video project export settings');
  }
});

it('accepts the same non-upscaled 1080p30 dimensions used by the capability probe', () => {
  const source = { ...project, width: 1904, height: 1064 };
  const settings = {
    ...createSettings(),
    width: 1904,
    height: 1064,
    fps: 30,
    resolution: VideoResolutionPreset.P1080,
    mp4VideoCodec: VideoMp4Codec.HEVC,
  };
  expect(() =>
    assertVideoProjectExportSettingsCompatibleWithProject(source, settings)
  ).not.toThrow();
  expect(() =>
    assertVideoProjectExportSettingsCompatibleWithProject(source, {
      ...settings,
      width: 1932,
      height: 1080,
    })
  ).toThrow();
});

it('validates selected clips and subtitle sidecars alongside fitted output dimensions', () => {
  const settings = { ...createSettings(), subtitleSidecarFormats: ['srt', 'vtt'] };
  expect(() =>
    assertVideoProjectExportSettingsCompatibleWithProject(project, settings)
  ).not.toThrow();
  for (const patch of [
    { scope: 'selected-clip', selectedClipIds: [] },
    { scope: 'selected-clip', selectedClipIds: ['missing'] },
    { subtitleSidecarFormats: ['invalid'] },
  ]) {
    expect(() =>
      assertVideoProjectExportSettingsCompatibleWithProject(project, { ...settings, ...patch })
    ).toThrow('Invalid video project export settings');
  }
});

it('admits adaptive sampling only at 60 fps and preserves legacy constant settings', () => {
  for (const patch of [{}, { frameRateMode: 'constant' }, { frameRateMode: 'adaptive', fps: 60 }]) {
    expect(() =>
      assertVideoProjectExportSettingsCompatibleWithProject(project, {
        ...createSettings(),
        ...patch,
      })
    ).not.toThrow();
  }
  for (const patch of [
    { frameRateMode: 'adaptive' },
    { frameRateMode: 'adaptive', fps: 120 },
    { frameRateMode: 'unknown' },
    { frameRateMode: null },
  ]) {
    expect(() =>
      assertVideoProjectExportSettingsCompatibleWithProject(project, {
        ...createSettings(),
        ...patch,
      })
    ).toThrow('Invalid video project export settings');
  }
});
