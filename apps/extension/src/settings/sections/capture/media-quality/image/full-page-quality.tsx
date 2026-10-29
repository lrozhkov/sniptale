import { ImageSettingsSectionFormat } from './format';
import { ImageSettingsSectionQuality } from './quality';
import { SettingsSwitch } from '../../../../section-surface/panel-controls';
import { CompactSegmentedSelector } from '../../../../../ui/compact-inspector-controls/control-renderers';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
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
      className="inline-flex gap-0.5 rounded-[4px] bg-[var(--sniptale-color-surface-hover)]"
      role="radiogroup"
      aria-label={translate('imageSettings.section.fullPageProfileLabel')}
    >
      {PROFILE_OPTIONS.map((option) => {
        const selected = state.fullPage.policy.profile === option.value;
        return (
          <ProductActionButton
            compact
            tone="toggle"
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            active={selected}
            className={[
              'h-8 rounded-[4px] px-2.5 text-[13px] font-medium transition-colors',
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
          </ProductActionButton>
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
    <SettingsControlRow
      label={translate(labelKey)}
      className="!max-w-[480px]"
      keepInline
      valueMinimum={100}
    >
      <NumericRow
        appearance="plain"
        className="w-full"
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
  const imageState = {
    ...state,
    imageFormat: state.fullImage.imageFormat,
    imageQuality: state.fullImage.imageQuality,
    isQualityDisabled: state.fullImage.imageFormat === 'png',
    handleFormatChange: state.fullImage.handleFormatChange,
    handleQualityPreview: state.fullImage.handleQualityPreview,
    handleQualityCommit: state.fullImage.handleQualityCommit,
  };
  return (
    <div
      data-ui="settings.image.full-page"
      className="mt-2 space-y-1 border-t border-[var(--sniptale-color-border-subtle)] pt-3"
    >
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
      <ImageSettingsSectionFormat state={imageState} />
      <ImageSettingsSectionQuality state={imageState} />
      {(
        [
          ['preloadLazyContent', 'content.toolbar.fullPageLazyContent'],
          ['freezeMotion', 'content.toolbar.fullPageFreezeMotion'],
        ] as const
      ).map(([key, label]) => (
        <SettingsControlRow key={key} label={translate(label)}>
          <SettingsSwitch
            size="sm"
            checked={state.fullCapture.preferences[key]}
            aria-label={translate(label)}
            onClick={() =>
              void state.fullCapture.update({ [key]: !state.fullCapture.preferences[key] })
            }
          />
        </SettingsControlRow>
      ))}
      <SettingsControlRow label={translate('content.toolbar.fullPageFloatingTitle')}>
        <CompactSegmentedSelector
          columns={3}
          ariaLabel={translate('content.toolbar.fullPageFloatingTitle')}
          value={state.fullCapture.preferences.floatingElements}
          options={(
            [
              ['once', 'content.toolbar.fullPageFloatingOnce'],
              ['hide', 'content.toolbar.fullPageFloatingHide'],
              ['repeat', 'content.toolbar.fullPageFloatingRepeat'],
            ] as const
          ).map(([value, label]) => ({ value, label: translate(label) }))}
          onChange={(floatingElements) => void state.fullCapture.update({ floatingElements })}
        />
      </SettingsControlRow>
      <SettingsControlRow
        label={translate('imageSettings.section.fullPageProfileLabel')}
        className="settings-profile-choice !max-w-[560px]"
        keepInline
        valueMinimum={460}
      >
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
