import { AudioAmplitudeBars } from '@sniptale/ui/audio-amplitude-bars';
import type { AudioRecordingMeter } from '../session-types';
import { translate } from '../../../platform/i18n';

export function RecordingLevelMeter({
  meter,
  preparing,
  compact = false,
}: {
  meter: AudioRecordingMeter;
  preparing: boolean;
  compact?: boolean;
}) {
  const status = preparing ? 'preparing' : meter.status;
  if (status === 'idle') return null;
  const label = translate(`videoEditor.app.recordAudioSignal.${status}`);
  const active = status === 'voice' || status === 'silence' || status === 'listening';
  const percent = active ? Math.round(Math.max(0, Math.min(1, meter.level)) * 100) : 0;
  return (
    <div
      className={[
        'min-w-0 rounded-md border px-2 py-1.5 text-xs',
        compact ? 'grid grid-cols-2 gap-x-2 gap-y-1.5' : 'flex items-center gap-2',
        'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-canvas)]',
      ].join(' ')}
      data-ui="audio-recording.level"
    >
      <span
        className={[
          'text-[var(--sniptale-color-text-muted)]',
          compact ? 'col-start-1 row-start-1 min-w-0' : 'shrink-0',
        ].join(' ')}
      >
        {translate('videoEditor.app.recordAudioMicrophone')}
      </span>
      <div
        role="meter"
        aria-label={translate('videoEditor.app.recordAudioSignal.label')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={label}
        className={[
          'flex h-6 items-center justify-center rounded bg-[var(--sniptale-color-surface-hover)] px-2',
          compact ? 'col-span-2 row-start-2 min-w-0' : 'min-w-24',
        ].join(' ')}
      >
        <AudioAmplitudeBars
          active={active}
          peaks={active ? meter.peaks : meter.peaks.map(() => 0)}
          soundDetected={status === 'voice'}
          className="h-4"
        />
      </div>
      <span
        className={[
          'min-w-0 text-[var(--sniptale-color-text-muted)]',
          compact ? 'col-start-2 row-start-1 text-right' : '',
        ].join(' ')}
      >
        {label}
      </span>
    </div>
  );
}
