import { translate } from '../../../platform/i18n';
import { settingsCardClassName } from '../../section-surface/panel-controls';
import { SettingsRangeField } from '../../section-surface';
import type { useImageSettingsSection } from './controller';

const imageSettingsCardClassName = settingsCardClassName;

const imageSettingsQualityUnavailableClassName = [
  'rounded bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_52%,transparent)]',
  'px-2 py-1 text-xs text-[var(--sniptale-color-text-dim)]',
].join(' ');

function ImageSettingsQualityDescription({
  state,
}: {
  state: ReturnType<typeof useImageSettingsSection>;
}) {
  return (
    <span>
      {state.isQualityDisabled
        ? translate('imageSettings.section.qualityLosslessDescription')
        : state.imageQuality >= 90
          ? translate('imageSettings.section.qualityHighDescription')
          : state.imageQuality >= 70
            ? translate('imageSettings.section.qualityBalancedDescription')
            : state.imageQuality >= 50
              ? translate('imageSettings.section.qualityMediumDescription')
              : translate('imageSettings.section.qualityLowDescription')}
    </span>
  );
}

export function ImageSettingsSectionQuality({
  state,
}: {
  state: ReturnType<typeof useImageSettingsSection>;
}) {
  const qualityWrapperClassName = state.isQualityDisabled ? 'pointer-events-none opacity-40' : '';
  const qualityValue = state.isQualityDisabled ? 100 : state.imageQuality;

  return (
    <div className={imageSettingsCardClassName}>
      <SettingsRangeField
        min="1"
        max="100"
        value={qualityValue}
        onChange={(event) => state.handleQualityChange(Number(event.target.value))}
        disabled={state.isQualityDisabled}
        className={qualityWrapperClassName}
        label={translate('imageSettings.section.qualityLabel')}
        displayValue={qualityValue}
        displaySuffix="%"
        aside={
          state.isQualityDisabled ? (
            <span className={imageSettingsQualityUnavailableClassName}>
              {translate('imageSettings.section.qualityUnavailable')}
            </span>
          ) : undefined
        }
        hint={<ImageSettingsQualityDescription state={state} />}
      />
    </div>
  );
}
