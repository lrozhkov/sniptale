import { translate } from '../../../../platform/i18n';
import { BorderPresetEditor } from '../border-preset-editor';
import { settingsSectionClassName, SettingsSectionHeader } from '../../../section-surface';
import { HighlighterEffectsPanel } from './effects-panel';
import { HighlighterPresetsPanel } from './presets-panel';
import type { HighlighterSectionContentProps } from './types';

export function HighlighterSectionContent(props: HighlighterSectionContentProps) {
  const { state } = props;

  return (
    <div className={settingsSectionClassName}>
      <SettingsSectionHeader
        description={translate('highlighter.section.subtitle')}
        kicker={translate('settings.navigation.highlighter')}
      />

      <HighlighterPresetsPanel {...props} />
      <HighlighterEffectsPanel {...props} />

      <BorderPresetEditor
        isOpen={state.isEditorOpen}
        onClose={() => state.setIsEditorOpen(false)}
        onSave={state.handleSavePreset}
        {...(state.editingPreset === undefined ? {} : { preset: state.editingPreset })}
      />
    </div>
  );
}
