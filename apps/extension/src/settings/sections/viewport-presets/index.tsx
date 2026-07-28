import { PresetsSectionContent } from './section-content/content';
import { useViewportPresetsSection } from './controller';

export function PresetsSection() {
  const presetsSection = useViewportPresetsSection();
  return <PresetsSectionContent {...presetsSection} />;
}
