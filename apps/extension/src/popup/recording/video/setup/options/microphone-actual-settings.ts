import { translate, type TranslationKey } from '../../../../../platform/i18n';
import type { MicrophoneActualSettings } from '@sniptale/runtime-contracts/video/types/types';

export function formatActualMicrophoneSettings(settings: MicrophoneActualSettings | null): string {
  if (!settings || Object.keys(settings).length === 0) {
    return translate('popup.video.microphoneSettingsActualUnknown');
  }

  const parts = [
    formatSampleRate(settings.sampleRate),
    formatChannelCount(settings.channelCount),
    formatBooleanActualSetting('popup.video.microphoneEchoCancellation', settings.echoCancellation),
    formatBooleanActualSetting('popup.video.microphoneNoiseSuppression', settings.noiseSuppression),
    formatBooleanActualSetting('popup.video.microphoneAutoGainControl', settings.autoGainControl),
  ].filter((part): part is string => Boolean(part));

  return translate('popup.video.microphoneSettingsActual').replace('{settings}', parts.join(', '));
}

function formatSampleRate(sampleRate: number | undefined): string | null {
  if (typeof sampleRate !== 'number') {
    return null;
  }

  return translate('popup.video.microphoneActualSampleRate').replace(
    '{value}',
    String(Math.round(sampleRate / 100) / 10)
  );
}

function formatChannelCount(channelCount: number | undefined): string | null {
  if (typeof channelCount !== 'number') {
    return null;
  }
  if (channelCount === 1) {
    return translate('popup.video.microphoneActualChannelOne');
  }

  return translate('popup.video.microphoneActualChannels').replace('{value}', String(channelCount));
}

function formatBooleanActualSetting(
  labelKey: TranslationKey,
  value: boolean | undefined
): string | null {
  if (typeof value !== 'boolean') {
    return null;
  }

  return translate(
    value ? 'popup.video.microphoneActualEnabled' : 'popup.video.microphoneActualDisabled'
  ).replace('{label}', translate(labelKey));
}
