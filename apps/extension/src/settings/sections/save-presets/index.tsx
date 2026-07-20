import type { DragEvent } from 'react';

import { useSavePresetsSection } from './state/controller';
import { SavePresetsSectionContent } from './surface/content';

export function SavePresetsSection() {
  const savePresetsSection = useSavePresetsSection();
  const { editingPreset, ...contentProps } = savePresetsSection;

  const handleDragStart = (event: DragEvent<HTMLDivElement>, id: string) => {
    savePresetsSection.setDraggedId(id);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>, id: string) => {
    event.preventDefault();

    if (savePresetsSection.draggedId && savePresetsSection.draggedId !== id) {
      savePresetsSection.setDragOverId(id);
    }
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault();
    await savePresetsSection.handleDrop(targetId);
  };

  return (
    <SavePresetsSectionContent
      {...contentProps}
      onDragEnd={() => {
        savePresetsSection.setDraggedId(null);
        savePresetsSection.setDragOverId(null);
      }}
      onDragLeave={() => savePresetsSection.setDragOverId(null)}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      onDrop={handleDrop}
      {...(editingPreset === undefined ? {} : { editingPreset })}
    />
  );
}
