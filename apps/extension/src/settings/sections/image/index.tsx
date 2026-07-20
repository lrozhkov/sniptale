import { ImageSettingsSectionContent } from './content';
import { useImageSettingsSection } from './controller';

export function ImageSettingsSection() {
  const state = useImageSettingsSection();
  return <ImageSettingsSectionContent state={state} />;
}
