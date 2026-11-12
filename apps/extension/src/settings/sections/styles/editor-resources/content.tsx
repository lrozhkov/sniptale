import { AudioPresetsSettings } from './audio/view';
import { BackgroundPresetsSettings } from './backgrounds/view';
import { translate } from '../../../../platform/i18n';
import { SettingsSubpageTabs, settingsSectionClassName } from '../../../section-surface';
import { PalettesSettings } from './palettes/view';
import { SurfaceStylePresetsSettings } from './surface-styles/view';
import { GradientPresetsSettings } from './gradients/view';

export function EditorResourcesContent(props: {
  onViewChange?: (view: string) => void;
  view?: string;
}) {
  const view =
    props.view === 'surfaces' ||
    props.view === 'gradients' ||
    props.view === 'backgrounds' ||
    props.view === 'audio'
      ? props.view
      : 'palettes';
  return (
    <div className={settingsSectionClassName}>
      <SettingsSubpageTabs
        activeId={view}
        ariaLabel={translate('settings.navigation.editorResources')}
        items={[
          { id: 'palettes', label: translate('settings.navigation.views.palettes') },
          { id: 'surfaces', label: translate('settings.navigation.views.surfaces') },
          { id: 'gradients', label: translate('settings.navigation.views.gradients') },
          { id: 'audio', label: translate('settings.navigation.views.audio') },
          { id: 'backgrounds', label: translate('settings.navigation.views.backgrounds') },
        ]}
        onChange={props.onViewChange}
      />
      {view === 'audio' ? (
        <AudioPresetsSettings />
      ) : view === 'backgrounds' ? (
        <BackgroundPresetsSettings />
      ) : view === 'surfaces' ? (
        <SurfaceStylePresetsSettings />
      ) : view === 'gradients' ? (
        <GradientPresetsSettings />
      ) : (
        <PalettesSettings />
      )}
    </div>
  );
}
