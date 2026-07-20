import type {
  ScenarioAIAnnotation,
  ScenarioEditorAIRequestedStepChange,
} from '../../../../contracts/ai/scenario';
import type {
  ScenarioCaptureStep,
  ScenarioStepPatch,
} from '../../../../features/scenario/contracts/types/project';
import { createScenarioOverlayFromAIAnnotation } from '../attachments/overlays';

function createAnnotationOverlays(annotations: ScenarioAIAnnotation[] | undefined) {
  if (!annotations || annotations.length === 0) {
    return [];
  }

  return annotations
    .map((annotation) => createScenarioOverlayFromAIAnnotation(annotation))
    .filter((overlay): overlay is NonNullable<typeof overlay> => overlay !== null);
}

export function resolveOverlayPatch(
  step: ScenarioCaptureStep,
  requestedChange: ScenarioEditorAIRequestedStepChange
): ScenarioStepPatch | null {
  const hasAnnotationList = Array.isArray(requestedChange.annotations);
  const annotationsMode =
    requestedChange.annotationsMode ?? (hasAnnotationList ? 'replace' : undefined);

  if (annotationsMode === undefined) {
    return null;
  }

  if (annotationsMode === 'clear') {
    return { overlays: [] };
  }

  if (!hasAnnotationList) {
    return null;
  }

  const nextOverlays = createAnnotationOverlays(requestedChange.annotations);
  if (annotationsMode === 'append') {
    return { overlays: [...step.overlays, ...nextOverlays] };
  }

  return { overlays: nextOverlays };
}
