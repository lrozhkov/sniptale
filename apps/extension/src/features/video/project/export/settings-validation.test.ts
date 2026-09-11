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
    height: 480,
    mp4VideoCodec: VideoMp4Codec.AVC,
    quality: VideoExportQualityPreset.HIGH,
    resolution: VideoResolutionPreset.P480,
    width: 928,
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
