import { translate } from '../../../platform/i18n';
import { FORMAT_OPTIONS } from './constants';
import { settingsCardClassName } from '../../section-surface/panel-controls';
import { settingsMetaLabelClassName } from '../../section-surface';
import type { useImageSettingsSection } from './controller';

const imageSettingsCardClassName = settingsCardClassName;

const imageSettingsFormatCardSelectedClassName = [
  'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_18%,var(--sniptale-color-border-soft)_82%)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_18%,var(--sniptale-color-surface-panel)_82%)]',
  'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_6%,transparent)]',
].join(' ');

const imageSettingsFormatCardIdleClassName = [
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_42%,transparent)]',
  'hover:border-[var(--sniptale-color-border-strong)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-border-subtle)_64%,transparent)]',
].join(' ');

function ImageSettingsFormatCard({
  isSelected,
  onSelect,
  option,
}: {
  isSelected: boolean;
  onSelect: () => void;
  option: (typeof FORMAT_OPTIONS)[number];
}) {
  const radioClassName = isSelected
    ? 'border-[var(--sniptale-color-accent)]'
    : 'border-[var(--sniptale-color-border-strong)]';

  const labelClassName = isSelected
    ? 'font-medium text-[var(--sniptale-color-accent)]'
    : 'font-medium text-[var(--sniptale-color-text-secondary)]';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'relative rounded-lg border p-3 text-left transition-all',
        isSelected
          ? imageSettingsFormatCardSelectedClassName
          : imageSettingsFormatCardIdleClassName,
      ].join(' ')}
    >
      <div className="mb-1 flex items-center gap-2">
        <div
          className={[
            'flex h-4 w-4 items-center justify-center rounded-full border-2',
            radioClassName,
          ].join(' ')}
        >
          {isSelected ? (
            <div className="h-2 w-2 rounded-full bg-[var(--sniptale-color-accent)]" />
          ) : null}
        </div>
        <span className={labelClassName}>{translate(option.labelKey)}</span>
      </div>
      <p className="ml-6 text-xs text-[var(--sniptale-color-text-dim)]">
        {translate(option.descriptionKey)}
      </p>
    </button>
  );
}

export function ImageSettingsSectionFormat({
  state,
}: {
  state: ReturnType<typeof useImageSettingsSection>;
}) {
  return (
    <div className={`mb-4 ${imageSettingsCardClassName}`}>
      <label className={`mb-3 block ${settingsMetaLabelClassName}`}>
        {translate('imageSettings.section.formatLabel')}
      </label>
      <div className="grid gap-3 md:grid-cols-3">
        {FORMAT_OPTIONS.map((option) => (
          <ImageSettingsFormatCard
            key={option.value}
            option={option}
            isSelected={state.imageFormat === option.value}
            onSelect={() => state.handleFormatChange(option.value)}
          />
        ))}
      </div>
    </div>
  );
}
