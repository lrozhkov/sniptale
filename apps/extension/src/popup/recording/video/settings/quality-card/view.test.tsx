import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));

import { QualityCard } from './view';
import {
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';

function createSettings(quality: VideoRecordingSettings['quality']): VideoRecordingSettings {
  return {
    microphoneEnabled: true,
    microphoneDeviceId: null,
    systemAudioEnabled: true,
    quality,
    countdownSeconds: 3,
    autoFadeDelay: 2,
    openEditorAfterRecording: false,
    diagnosticsEnabled: false,
  };
}

describe('quality card view', () => {
  it('renders quality options and patches selected quality', () => {
    const onSettingsChange = vi.fn();

    const card = QualityCard({
      settings: createSettings(VideoQuality.LOW),
      onSettingsChange,
    });

    expect(card.props.value).toBe(VideoQuality.LOW);
    expect(card.props.options).toHaveLength(4);

    card.props.onChange(VideoQuality.MEDIUM);

    expect(onSettingsChange).toHaveBeenCalledWith({ quality: VideoQuality.MEDIUM });
  });

  it('falls back through quality option normalization for unknown settings', () => {
    const onSettingsChange = vi.fn();
    const card = QualityCard({
      settings: createSettings('BROKEN' as VideoQuality),
      onSettingsChange,
    });

    expect(card.props.value).toBe(VideoQuality.HIGH);
  });
});
