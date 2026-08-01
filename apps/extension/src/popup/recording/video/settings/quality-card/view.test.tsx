import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));

import { QualityCard } from './view';
import {
  DEFAULT_VIDEO_OUTPUT_PROFILE,
  VideoRecordingBuiltInProfileId,
  VideoQuality,
  type VideoOutputProfile,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

function createSettings(quality: VideoOutputProfile['quality']): VideoRecordingSettings {
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    microphoneEnabled: true,
    microphoneDeviceId: null,
    systemAudioEnabled: true,
    outputProfile: { ...DEFAULT_VIDEO_OUTPUT_PROFILE, quality },
    countdownSeconds: 3,
    autoFadeDelay: 2,
    openEditorAfterRecording: false,
    diagnosticsEnabled: false,
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
      outputProfile: expect.objectContaining({ quality: VideoQuality.MEDIUM, resolution: '720P' }),
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
