import type { ScenarioSlide } from './slide';

export const SCENARIO_TEMPLATE_CATALOG_STATUS = {
  core: 'core',
  disabled: 'disabled',
  optional: 'optional',
} as const;

export type ScenarioTemplateCatalogStatus =
  (typeof SCENARIO_TEMPLATE_CATALOG_STATUS)[keyof typeof SCENARIO_TEMPLATE_CATALOG_STATUS];

export interface ScenarioTemplateDefinition {
  catalogRank: number;
  catalogStatus: ScenarioTemplateCatalogStatus;
  description: string;
  group: string;
  label: string;
  slide: ScenarioTemplateSlideDefinition;
  source: 'bundled' | 'imported';
  templateId: string;
  version: 1;
}

export type ScenarioTemplateSlideDefinition = Pick<
  ScenarioSlide,
  'canvas' | 'elements' | 'layout' | 'notes' | 'title'
>;

export interface ScenarioTemplateLibraryRef {
  enabled: boolean;
  libraryId: string;
}

export interface ScenarioImportedTemplateLibrary {
  createdAt: number;
  id: string;
  name: string;
  templates: ScenarioTemplateDefinition[];
  updatedAt: number;
}
