import { FULL_PAGE_QUALITY_ABSOLUTE_LIMITS } from '../../../../../contracts/full-page-capture';
import { translate } from '../../../../../platform/i18n';
import { NumericRow } from '../../../../../ui/compact-inspector-controls';
import { SettingsControlRow } from '../../../../section-surface';
import type { useImageSettingsSection } from './controller';

type State = ReturnType<typeof useImageSettingsSection>;

const PROFILE_OPTIONS = [
  { labelKey: 'imageSettings.section.fullPageProfileSafe', value: 'safe' },
  { labelKey: 'imageSettings.section.fullPageProfileHighQuality', value: 'high-quality' },
  { labelKey: 'imageSettings.section.fullPageProfileMaximum', value: 'maximum' },
  { labelKey: 'imageSettings.section.fullPageProfileCustom', value: 'custom' },
] as const;

function ProfileSelector({ state }: { state: State }) {
  return (
    <div
      className="inline-flex gap-0.5 rounded-lg bg-[var(--sniptale-color-surface-hover)] p-0.5"
      role="radiogroup"
      aria-label={translate('imageSettings.section.fullPageProfileLabel')}
    >
      {PROFILE_OPTIONS.map((option) => {
        const selected = state.fullPage.policy.profile === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={[
              'h-7 rounded-md px-2.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-[var(--sniptale-color-focus-ring)]',
              selected
                ? [
                    'bg-[var(--sniptale-color-surface-panel)]',
                    'text-[var(--sniptale-color-text-primary)]',
                  ].join(' ')
                : 'text-[var(--sniptale-color-text-muted)] hover:text-[var(--sniptale-color-text-primary)]',
            ].join(' ')}
            onClick={() => state.fullPage.handleProfileChange(option.value)}
          >
            {translate(option.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

function PolicyNumber({
  field,
  labelKey,
  max,
  min,
  state,
  unit,
}: {
  field: 'maxFileSizeMiB' | 'maxMegapixels' | 'minScalePercent';
  labelKey: Parameters<typeof translate>[0];
  max: number;
  min: number;
  state: State;
  unit: '' | '%';
}) {
  return (
    <SettingsControlRow label={translate(labelKey)}>
      <NumericRow
        appearance="plain"
        className="min-h-10 w-full !grid-cols-1 py-1.5 [&>div]:!col-start-1"
        label={translate(labelKey)}
        labelVisible={false}
        min={min}
        max={max}
        step={1}
        unit={unit}
        value={state.fullPage.policy[field]}
        scrub={{ min, max, step: 1 }}
        onPreviewValue={(value) => state.fullPage.handleValuePreview(field, value)}
        onCommitValue={(value) => state.fullPage.handleValueCommit(field, value)}
      />
    </SettingsControlRow>
  );
}

export function FullPageQualitySettings({ state }: { state: State }) {
  const limits = FULL_PAGE_QUALITY_ABSOLUTE_LIMITS;
  return (
    <div className="mt-2 space-y-1 border-t border-[var(--sniptale-color-border-subtle)] pt-3">
      <div className="px-1">
        <div>
          <div className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
            {translate('imageSettings.section.fullPageTitle')}
          </div>
          <p className="mt-0.5 max-w-2xl text-xs leading-5 text-[var(--sniptale-color-text-muted)]">
            {translate('imageSettings.section.fullPageDescription')}
          </p>
        </div>
      </div>
      <SettingsControlRow label={translate('imageSettings.section.fullPageProfileLabel')}>
        <ProfileSelector state={state} />
      </SettingsControlRow>
      <PolicyNumber
        field="maxMegapixels"
        labelKey="imageSettings.section.fullPageMaxSize"
        min={limits.minMegapixels}
        max={limits.maxMegapixels}
        state={state}
        unit=""
      />
      <PolicyNumber
        field="minScalePercent"
        labelKey="imageSettings.section.fullPageMinScale"
        min={limits.minScalePercent}
        max={100}
        state={state}
        unit="%"
      />
      <PolicyNumber
        field="maxFileSizeMiB"
        labelKey="imageSettings.section.fullPageMaxFileSize"
        min={limits.minFileSizeMiB}
        max={limits.maxFileSizeMiB}
        state={state}
        unit=""
      />
      {state.fullPage.error ? (
        <p role="alert" className="px-1 text-xs text-[var(--sniptale-color-danger)]">
          {translate(state.fullPage.error)}
        </p>
      ) : null}
    </div>
  );
}
