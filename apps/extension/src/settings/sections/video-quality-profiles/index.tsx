import { VideoQualityProfilesContent } from './content';
import { useVideoQualityProfiles } from './use-profiles';
import { DelayedSettingsCenteredLoadingState } from '../../section-surface/loading-state';

export function VideoQualityProfilesSection() {
  const profiles = useVideoQualityProfiles();
  if (!profiles.state.settings && !profiles.state.error) {
    return <DelayedSettingsCenteredLoadingState />;
  }
  return <VideoQualityProfilesContent {...profiles} />;
}
