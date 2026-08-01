import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));

import { QualityCard } from './view';
import {
  DEFAULT_VIDEO_RECORDING_OUTPUT_SETTINGS,
  VideoRecordingBuiltInProfileId,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

function createSettings(quality: VideoRecordingSettings['quality']): VideoRecordingSettings {
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    microphoneEnabled: true,
    microphoneDeviceId: null,
    systemAudioEnabled: true,
    quality,
    countdownSeconds: 3,
    autoFadeDelay: 2,
    openEditorAfterRecording: false,
    diagnosticsEnabled: false,
    output: DEFAULT_VIDEO_RECORDING_OUTPUT_SETTINGS,
    qualityProfileId: VideoRecordingBuiltInProfileId.OPTIMAL,
  };
}

describe('quality card view', () => {
  it('renders concise profiles and materializes the selected profile settings', () => {
    const onSettingsChange = vi.fn();

    const card = QualityCard({
      settings: createSettings(VideoQuality.HIGH),
      onSettingsChange,
    });

    expect(card.props.value).toBe(VideoRecordingBuiltInProfileId.OPTIMAL);
    expect(card.props.options).toHaveLength(4);

    card.props.onChange(VideoRecordingBuiltInProfileId.COMPACT);

    expect(onSettingsChange).toHaveBeenCalledWith({
      output: expect.objectContaining({ resolution: '720P' }),
      quality: VideoQuality.MEDIUM,
      qualityProfileId: VideoRecordingBuiltInProfileId.COMPACT,
    });
    expect(card.props.secondaryAction.panel).toBeTruthy();
  });

  it('falls back through quality option normalization for unknown settings', () => {
    const onSettingsChange = vi.fn();
    const card = QualityCard({
      settings: createSettings('BROKEN' as VideoQuality),
      onSettingsChange,
    });

    expect(card.props.value).toBe('current:custom');
    card.props.onChange('missing-profile');
    expect(onSettingsChange).not.toHaveBeenCalled();
  });
});
