import { translate } from '../../../../../platform/i18n';
import { NumericRow } from '../../../../../ui/compact-inspector-controls';
import { SettingsControlRow } from '../../../../section-surface';
import type { useImageSettingsSection } from './controller';

export function ImageSettingsSectionQuality({
  state,
}: {
  state: ReturnType<typeof useImageSettingsSection>;
}) {
  const qualityValue = state.isQualityDisabled ? 100 : state.imageQuality;

  return (
    <SettingsControlRow label={translate('imageSettings.section.qualityLabel')}>
      <NumericRow
        appearance="plain"
        className="min-h-10 w-full !grid-cols-1 py-1.5 [&>div]:!col-start-1"
        label={translate('imageSettings.section.qualityLabel')}
        labelVisible={false}
        min={1}
        max={100}
        step={1}
        unit="%"
        value={qualityValue}
        scrub={{ min: 1, max: 100, step: 1 }}
        disabled={state.isQualityDisabled}
        onPreviewValue={state.handleQualityPreview}
        onCommitValue={(quality) => void state.handleQualityCommit(quality)}
      />
    </SettingsControlRow>
  );
}
