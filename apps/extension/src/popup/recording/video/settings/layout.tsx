import { getCurrentLocale, translate } from '../../../../platform/i18n';
import {
  CaptureMode,
  normalizeVideoSourceCount,
  VIDEO_SOURCE_COUNT_MAX,
  VIDEO_SOURCE_COUNT_MIN,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { CounterCard } from './counter-card';
import { QualityCard } from './quality-card/view';

function formatSourceCount(value: number): string {
  if (value === 1) {
    return translate('popup.video.sourceCountOne');
  }

  return translate('popup.video.sourceCountMany').replace('{count}', String(value));
}

function replaceCount(message: string, value: number): string {
  return message.replace('{count}', String(value));
}

function formatCountdownOption(value: number): string {
  if (value === 0) {
    return translate('popup.video.countdownZeroOption');
  }

  if (value === 1) {
    return translate('popup.video.countdownOneOption');
  }

  if (getCurrentLocale() === 'ru' && value >= 2 && value <= 4) {
    return replaceCount(translate('popup.video.countdownFewOption'), value);
  }

  return replaceCount(translate('popup.video.countdownManyOption'), value);
}

function formatCountdownSelectedValue(value: number): string {
  if (value === 0) {
    return translate('popup.video.countdownImmediateValue');
  }

  return translate('popup.video.countdownDelayedValue').replace(
    '{duration}',
    formatCountdownOption(value)
  );
}

export function VideoSettingsGrid({
  captureMode,
  settings,
  onSettingsChange,
}: {
  captureMode?: CaptureMode;
  settings: VideoRecordingSettings;
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
}) {
  const showSourceCount = captureMode === CaptureMode.SCREEN;

  return (
    <div className="mt-0.5 flex flex-col">
      <QualityCard settings={settings} onSettingsChange={onSettingsChange} />
      {showSourceCount ? (
        <CounterCard
          label={translate('popup.video.sourceCountLabel')}
          value={normalizeVideoSourceCount(settings.sourceCount)}
          min={VIDEO_SOURCE_COUNT_MIN}
          max={VIDEO_SOURCE_COUNT_MAX}
          suffix={translate('popup.video.sourceCountSuffix')}
          formatValue={formatSourceCount}
          notice={translate('popup.video.sourceCountNotice')}
          onChange={(value) => onSettingsChange({ sourceCount: value })}
        />
      ) : null}
      <CounterCard
        label={translate('popup.video.countdownLabel')}
        value={settings.countdownSeconds}
        min={0}
        max={10}
        suffix={translate('popup.video.secondsSuffix')}
        formatValue={formatCountdownOption}
        formatSelectedValue={formatCountdownSelectedValue}
        onChange={(value) => onSettingsChange({ countdownSeconds: value })}
      />
    </div>
  );
}
