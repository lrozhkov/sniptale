import { translate } from '../../../../../platform/i18n';
import { BorderPresetEditor } from '../../../../../ui/highlighter-preset-editor';
import { settingsSectionClassName, SettingsSectionHeader } from '../../../../section-surface';
import { HighlighterPresetsPanel } from './presets-panel';
import type { HighlighterSectionContentProps } from './types';
import { useLinkedAnnotationTemplateOptions } from '../../../../../composition/frame-annotation-controls/frame/linked-template-options';

export function HighlighterSectionContent(props: HighlighterSectionContentProps) {
  const { presets } = props;
  const linkedTemplateOptions = useLinkedAnnotationTemplateOptions();

  return (
    <div className={settingsSectionClassName}>
      <SettingsSectionHeader
        description={translate('highlighter.section.subtitle')}
        kicker={translate('settings.navigation.highlighter')}
      />

      <HighlighterPresetsPanel presets={presets} settings={props.settings} />
      <BorderPresetEditor
        isOpen={presets.isEditorOpen}
        onClose={presets.handleCloseEditor}
        onSave={presets.handleSavePreset}
        linkedTemplateOptions={linkedTemplateOptions}
        {...(presets.editingPreset === undefined ? {} : { preset: presets.editingPreset })}
      />
    </div>
  );
}
