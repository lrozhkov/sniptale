import { translate } from '../../../../../platform/i18n';

export function PopupHomeQuickActionsEmptyState() {
  return (
    <div
      className={
        'flex h-full min-h-[132px] items-center justify-center rounded-[12px] ' +
        'border border-dashed border-[var(--sniptale-color-border-soft)] ' +
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-border-subtle)_34%,transparent)] ' +
        'px-4 text-center text-xs leading-5 ' +
        'text-[var(--sniptale-color-text-muted-strong)]'
      }
    >
      {translate('popup.home.quickActionsEmpty')}
    </div>
  );
}
