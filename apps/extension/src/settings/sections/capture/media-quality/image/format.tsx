import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../../../platform/i18n';
import { FORMAT_OPTIONS } from './constants';
import { SettingsControlRow } from '../../../../section-surface';
import type { useImageSettingsSection } from './controller';

function ImageSettingsFormatOption({
  isSelected,
  onSelect,
  option,
}: {
  isSelected: boolean;
  onSelect: () => void;
  option: (typeof FORMAT_OPTIONS)[number];
}) {
  return (
    <ProductActionButton
      compact
      tone="toggle"
      type="button"
      role="radio"
      aria-checked={isSelected}
      active={isSelected}
      title={translate(option.labelKey)}
      onClick={onSelect}
      className={[
        'inline-flex h-8 min-w-[4rem] items-center justify-center rounded-[4px] px-2.5',
        'text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-[var(--sniptale-color-focus-ring)]',
        isSelected
          ? 'bg-[var(--sniptale-color-surface-panel)] font-medium text-[var(--sniptale-color-text-primary)]'
          : 'font-medium text-[var(--sniptale-color-text-muted)] hover:text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
    >
      {translate(option.labelKey)}
    </ProductActionButton>
  );
}

export function ImageSettingsSectionFormat({
  state,
}: {
  state: ReturnType<typeof useImageSettingsSection>;
}) {
  return (
    <SettingsControlRow label={translate('imageSettings.section.formatLabel')}>
      <div
        role="radiogroup"
        aria-label={translate('imageSettings.section.formatLabel')}
        className="inline-flex w-fit gap-0.5 rounded-[4px] bg-[var(--sniptale-color-surface-hover)] p-0.5"
      >
        {FORMAT_OPTIONS.map((option) => (
          <ImageSettingsFormatOption
            key={option.value}
            option={option}
            isSelected={state.imageFormat === option.value}
            onSelect={() => state.handleFormatChange(option.value)}
          />
        ))}
      </div>
    </SettingsControlRow>
  );
}
