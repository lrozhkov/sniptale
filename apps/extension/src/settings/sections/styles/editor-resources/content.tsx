import { translate } from '../../../../platform/i18n';
import {
  SettingsSubpageTabs,
  settingsSectionClassName,
  SettingsSectionHeader,
} from '../../../section-surface';
import { ToolPresetsSettings } from './tools/view';
import { PalettesSettings } from './palettes/view';

export function EditorResourcesContent(props: {
  onViewChange?: (view: string) => void;
  view?: string;
}) {
  const view = props.view === 'palettes' ? 'palettes' : 'tools';
  return (
    <div className={settingsSectionClassName}>
      <SettingsSectionHeader
        kicker={translate('settings.navigation.editorResources')}
        description={translate('settings.editor.subtitle')}
      />
      <SettingsSubpageTabs
        activeId={view}
        ariaLabel={translate('settings.navigation.editorResources')}
        items={[
          { id: 'tools', label: translate('settings.navigation.views.tools') },
          { id: 'palettes', label: translate('settings.navigation.views.palettes') },
        ]}
        onChange={props.onViewChange}
      />
      {view === 'palettes' ? <PalettesSettings /> : <ToolPresetsSettings />}
    </div>
  );
}
