import {
  settingsCompactWorkbenchClassName,
  settingsSectionClassName,
} from '../../../../section-surface';
import { ImageSettingsSectionFormat } from './format';
import { ImageSettingsSectionQuality } from './quality';
import type { useImageSettingsSection } from './controller';
import { FullPageQualitySettings } from './full-page-quality';

export function ImageSettingsSectionContent({
  state,
}: {
  state: ReturnType<typeof useImageSettingsSection>;
}) {
  return (
    <div className={`${settingsSectionClassName} ${settingsCompactWorkbenchClassName} !space-y-1`}>
      <ImageSettingsSectionFormat state={state} />
      <ImageSettingsSectionQuality state={state} />
      <FullPageQualitySettings state={state} />
    </div>
  );
}
