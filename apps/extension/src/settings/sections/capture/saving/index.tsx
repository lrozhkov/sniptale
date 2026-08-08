import { useSavePresetsSection } from './state/controller';
import { SavePresetsSectionContent } from './surface/content';

export function SavePresetsSection() {
  const savePresetsSection = useSavePresetsSection();
  const { editingPreset, ...contentProps } = savePresetsSection;

  return (
    <SavePresetsSectionContent
      {...contentProps}
      onMoveBefore={savePresetsSection.handleMoveBefore}
      {...(editingPreset === undefined ? {} : { editingPreset })}
    />
  );
}
