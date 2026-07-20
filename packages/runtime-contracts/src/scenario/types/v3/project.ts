import type { ScenarioSlide, ScenarioTrashedSlide } from './slide';
import type { ScenarioProjectPresentationSettings } from './presentation';
import type { ScenarioTemplateLibraryRef } from './template';

export interface ScenarioProjectV3 {
  createdAt: number;
  id: string;
  name: string;
  presentation: ScenarioProjectPresentationSettings;
  slides: ScenarioSlide[];
  tags: string[];
  templateLibraries: ScenarioTemplateLibraryRef[];
  trash: ScenarioTrashedSlide[];
  updatedAt: number;
  version: 3;
}
