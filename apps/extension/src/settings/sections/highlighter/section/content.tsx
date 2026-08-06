import { translate } from '../../../../platform/i18n';
import { BorderPresetEditor } from '../../../../ui/highlighter-preset-editor';
import { settingsSectionClassName, SettingsSectionHeader } from '../../../section-surface';
import { HighlighterPresetsPanel } from './presets-panel';
import type { HighlighterSectionContentProps } from './types';
import { CalloutPresetCatalogSettings } from '../callout-presets';
import { StepBadgePresetCatalogSettings } from '../step-badge-presets';

export function HighlighterSectionContent(props: HighlighterSectionContentProps) {
  const { presets } = props;

  return (
    <div className={settingsSectionClassName}>
      <SettingsSectionHeader
        description={translate('highlighter.section.subtitle')}
        kicker={translate('settings.navigation.highlighter')}
      />

      <HighlighterPresetsPanel presets={presets} settings={props.settings} />
      <CalloutPresetCatalogSettings controller={props.calloutPresets} />
      {props.stepBadgePresets ? (
        <StepBadgePresetCatalogSettings controller={props.stepBadgePresets} />
      ) : null}
      <BorderPresetEditor
        isOpen={presets.isEditorOpen}
        onClose={presets.handleCloseEditor}
        onSave={presets.handleSavePreset}
        {...(presets.editingPreset === undefined ? {} : { preset: presets.editingPreset })}
      />
    </div>
  );
}
