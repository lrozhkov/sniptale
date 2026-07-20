import { Loader2 } from 'lucide-react';
import { translate } from '../../../../platform/i18n';

export function VideoSavingPanel() {
  return (
    <div
      className={[
        'flex min-h-0 flex-1 flex-col items-center justify-center rounded-[14px] border p-5',
        'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-canvas)] text-center',
      ].join(' ')}
    >
      <Loader2 className="h-7 w-7 animate-spin text-[var(--sniptale-color-accent-emphasis)]" />
      <div className="mt-4 text-base font-semibold text-[var(--sniptale-color-text-primary)]">
        {translate('popup.video.savingTitle')}
      </div>
      <div className="mt-1 text-xs text-[var(--sniptale-color-text-muted-strong)]">
        {translate('popup.video.savingDescription')}
      </div>
    </div>
  );
}
