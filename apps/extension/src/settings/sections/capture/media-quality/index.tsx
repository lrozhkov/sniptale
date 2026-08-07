import { translate } from '../../../../platform/i18n';
import { SettingsSubpageTabs } from '../../../section-surface';
import { ImageSettingsSection } from './image';
import { VideoQualityProfilesSection } from './video';

export function MediaQualitySection(props: {
  onViewChange?: (view: string) => void;
  view?: string;
}) {
  const view = props.view === 'video' ? 'video' : 'image';
  return (
    <div className="space-y-5">
      <SettingsSubpageTabs
        activeId={view}
        ariaLabel={translate('settings.navigation.mediaQuality')}
        items={[
          { id: 'image', label: translate('settings.navigation.views.image') },
          { id: 'video', label: translate('settings.navigation.views.video') },
        ]}
        onChange={props.onViewChange}
      />
      {view === 'video' ? <VideoQualityProfilesSection /> : <ImageSettingsSection />}
    </div>
  );
}
