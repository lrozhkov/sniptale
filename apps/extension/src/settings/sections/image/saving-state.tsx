import { translate } from '../../../platform/i18n';

const imageSettingsSavingSpinnerClassName = [
  'h-3 w-3 animate-spin rounded-full border-2',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_30%,transparent)]',
  'border-t-[var(--sniptale-color-accent)]',
].join(' ');

export function ImageSettingsSectionSavingState({ isLoading }: { isLoading: boolean }) {
  if (!isLoading) {
    return null;
  }

  return (
    <div className="mt-4 flex items-center gap-2 text-xs text-[var(--sniptale-color-text-dim)]">
      <div className={imageSettingsSavingSpinnerClassName} />
      {translate('imageSettings.section.saving')}
    </div>
  );
}
