import type {
  ScenarioImportedTemplateLibrary,
  ScenarioTemplateDefinition,
} from '@sniptale/runtime-contracts/scenario/types/v3';

export interface ScenarioEditorTemplateLibrary extends ScenarioImportedTemplateLibrary {
  enabled: boolean;
}

export interface ScenarioTemplatePickerProps {
  onCreateSlide: (template: ScenarioTemplateDefinition) => void;
  onOpenManager: () => void;
  surface?: 'dropdown' | 'embedded';
  templates: readonly ScenarioTemplateDefinition[];
}
