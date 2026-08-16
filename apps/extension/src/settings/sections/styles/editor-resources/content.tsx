import { translate } from '../../../../platform/i18n';
import { SettingsSubpageTabs, settingsSectionClassName } from '../../../section-surface';
import { ToolPresetsSettings } from './tools/view';
import { PalettesSettings } from './palettes/view';
import { SurfaceStylePresetsSettings } from './surface-styles/view';
import { GradientPresetsSettings } from './gradients/view';

export function EditorResourcesContent(props: {
  onViewChange?: (view: string) => void;
  view?: string;
}) {
  const supportedViews = ['tools', 'palettes', 'surfaces', 'gradients'] as const;
  const view = supportedViews.includes(props.view as (typeof supportedViews)[number])
    ? (props.view as (typeof supportedViews)[number])
    : 'tools';
  return (
    <div className={settingsSectionClassName}>
      <SettingsSubpageTabs
        activeId={view}
        ariaLabel={translate('settings.navigation.editorResources')}
        items={[
          { id: 'tools', label: translate('settings.navigation.views.tools') },
          { id: 'palettes', label: translate('settings.navigation.views.palettes') },
          { id: 'surfaces', label: translate('settings.navigation.views.surfaces') },
          { id: 'gradients', label: translate('settings.navigation.views.gradients') },
        ]}
        onChange={props.onViewChange}
      />
      {view === 'palettes' ? (
        <PalettesSettings />
      ) : view === 'surfaces' ? (
        <SurfaceStylePresetsSettings />
      ) : view === 'gradients' ? (
        <GradientPresetsSettings />
      ) : (
        <ToolPresetsSettings />
      )}
    </div>
  );
}
