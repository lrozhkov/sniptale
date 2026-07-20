import { settingsSectionClassName } from '../../section-surface';
import { ImageSettingsSectionFormat } from './format';
import { ImageSettingsSectionHeader } from './header';
import { ImageSettingsSectionQuality } from './quality';
import { ImageSettingsSectionSavingState } from './saving-state';
import { ImageSettingsSectionTips } from './tips';
import type { useImageSettingsSection } from './controller';

export function ImageSettingsSectionContent({
  state,
}: {
  state: ReturnType<typeof useImageSettingsSection>;
}) {
  return (
    <div className={settingsSectionClassName}>
      <ImageSettingsSectionHeader />
      <ImageSettingsSectionFormat state={state} />
      <ImageSettingsSectionQuality state={state} />
      <ImageSettingsSectionSavingState isLoading={state.isLoading} />
      <ImageSettingsSectionTips />
    </div>
  );
}
