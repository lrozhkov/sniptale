import { translate } from '../../../../platform/i18n';
import { BorderPresetEditor } from '../border-preset-editor';
import { settingsSectionClassName, SettingsSectionHeader } from '../../../section-surface';
import { HighlighterEffectsPanel } from './effects-panel';
import { HighlighterPresetsPanel } from './presets-panel';
import type { HighlighterSectionContentProps } from './types';

export function HighlighterSectionContent(props: HighlighterSectionContentProps) {
  const { presets } = props;

  return (
    <div className={settingsSectionClassName}>
      <SettingsSectionHeader
        description={translate('highlighter.section.subtitle')}
        kicker={translate('settings.navigation.highlighter')}
      />

      <HighlighterPresetsPanel presets={presets} settings={props.settings} />
      <HighlighterEffectsPanel effects={props.effects} settings={props.settings} />

      <BorderPresetEditor
        isOpen={presets.isEditorOpen}
        onClose={presets.handleCloseEditor}
        onSave={presets.handleSavePreset}
        {...(presets.editingPreset === undefined ? {} : { preset: presets.editingPreset })}
      />
    </div>
  );
}
