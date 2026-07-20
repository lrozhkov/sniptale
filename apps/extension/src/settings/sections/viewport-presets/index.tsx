import { PresetsSectionContent } from './section-content';
import { useViewportPresetsSection } from './controller';

export function PresetsSection() {
  const presetsSection = useViewportPresetsSection();
  const { editingViewport, ...contentProps } = presetsSection;

  return (
    <PresetsSectionContent
      {...contentProps}
      {...(editingViewport === undefined ? {} : { editingViewport })}
    />
  );
}
