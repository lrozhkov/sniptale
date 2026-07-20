import { translate } from '../../../../platform/i18n';
import { NumericRow } from '../../../chrome/ui';
import type { useEditorExportSettingsState } from '../export-settings';

export function EditorDocumentExportPreferencesQualitySection(props: {
  settings: ReturnType<typeof useEditorExportSettingsState>;
}) {
  if (props.settings.imageFormat === 'png') {
    return null;
  }

  const commitImageQuality = () => {
    void props.settings.commitImageQuality();
  };

  return (
    <section className="space-y-2">
      <NumericRow
        label={translate('imageSettings.section.qualityLabel')}
        value={props.settings.imageQuality}
        unit="%"
        min={1}
        max={100}
        step={1}
        onPreviewValue={props.settings.setImageQuality}
        onCommitValue={(imageQuality) => {
          props.settings.setImageQuality(imageQuality);
          commitImageQuality();
        }}
        scrub={{ min: 1, max: 100, step: 1 }}
      />
    </section>
  );
}
