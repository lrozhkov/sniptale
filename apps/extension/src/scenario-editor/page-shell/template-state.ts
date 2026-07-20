import { useMemo, useState } from 'react';
import {
  instantiateScenarioTemplateSlide,
  listBundledScenarioTemplates,
} from '../../features/scenario/project/v3/templates';
import type { ScenarioTemplateDefinition } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioEditorTemplateLibrary } from '../project/templates';
import type { useScenarioV3EditorState } from './state';

type TemplatePanelMode = 'manager';

export function useScenarioV3TemplateState(editor: ReturnType<typeof useScenarioV3EditorState>) {
  const [libraries, setLibraries] = useState<ScenarioEditorTemplateLibrary[]>([]);
  const [panelMode, setPanelMode] = useState<TemplatePanelMode | null>(null);
  const templates = useMemo(() => listAvailableTemplates(libraries), [libraries]);

  return {
    closePanel: () => setPanelMode(null),
    createSlide: (template: ScenarioTemplateDefinition) => {
      editor.slideActions.addTemplateSlide(instantiateScenarioTemplateSlide(template));
      setPanelMode(null);
    },
    deleteLibrary: (libraryId: string) =>
      setLibraries((current) => current.filter((library) => library.id !== libraryId)),
    libraries,
    openManager: () => setPanelMode('manager'),
    panelMode,
    saveLibrary: (library: ScenarioEditorTemplateLibrary) =>
      setLibraries((current) => [...current, library]),
    templates,
    toggleLibrary: (libraryId: string) =>
      setLibraries((current) =>
        current.map((library) =>
          library.id === libraryId ? { ...library, enabled: !library.enabled } : library
        )
      ),
  };
}

function listAvailableTemplates(libraries: ScenarioEditorTemplateLibrary[]) {
  return [
    ...listBundledScenarioTemplates(),
    ...libraries.filter((library) => library.enabled).flatMap((library) => library.templates),
  ];
}
