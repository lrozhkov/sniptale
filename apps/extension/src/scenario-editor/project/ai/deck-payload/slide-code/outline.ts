import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';

export interface ScenarioAiProjectOutline {
  id: string;
  name: string;
  slides: Array<{
    elementCount: number;
    id: string;
    templateId: string | null;
    title: string;
  }>;
  version: 3;
}

export function createScenarioAiProjectOutline(
  project: ScenarioProjectV3
): ScenarioAiProjectOutline {
  return {
    id: project.id,
    name: project.name,
    slides: project.slides.map((slide) => ({
      elementCount: slide.elements.length,
      id: slide.id,
      templateId: slide.templateId,
      title: slide.title,
    })),
    version: 3,
  };
}
