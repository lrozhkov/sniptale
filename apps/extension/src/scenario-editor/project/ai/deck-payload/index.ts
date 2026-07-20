import type {
  ScenarioProjectV3,
  ScenarioTemplateDefinition,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioAIAttachment } from '../../../../contracts/ai/scenario';
import {
  createScenarioAiProjectOutline,
  createScenarioAiToolManifest,
  serializeScenarioAiSlideCode,
} from './slide-code';

interface ScenarioEditorV3LLMPayload {
  attachments: ScenarioAIAttachment[];
  projectOutlineJson: string;
  projectSnapshotJson: string;
  selectedSlideCodeJson: string;
  toolManifestJson: string;
}

export function buildScenarioEditorV3LLMPayload(args: {
  project: ScenarioProjectV3;
  selectedSlideId: string;
  templates?: readonly ScenarioTemplateDefinition[];
}): ScenarioEditorV3LLMPayload {
  const selectedSlide =
    args.project.slides.find((slide) => slide.id === args.selectedSlideId) ??
    args.project.slides[0];
  if (!selectedSlide) {
    throw new Error('Scenario v3 project has no slides');
  }

  const outline = createScenarioAiProjectOutline(args.project);
  const slideCode = serializeScenarioAiSlideCode({ project: args.project, slide: selectedSlide });
  const manifest = createScenarioAiToolManifest(
    args.templates ? { templates: args.templates } : {}
  );

  return {
    attachments: [],
    projectOutlineJson: JSON.stringify(outline),
    projectSnapshotJson: JSON.stringify({ outline, selectedSlide: slideCode }),
    selectedSlideCodeJson: JSON.stringify(slideCode),
    toolManifestJson: JSON.stringify(manifest),
  };
}
