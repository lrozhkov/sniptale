import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioTemplateDefinition } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioAiOperation } from '@sniptale/runtime-contracts/scenario-ai-operations';
import { applyScenarioAiCanvasPatch } from './handlers/canvas';
import {
  addScenarioAiElementToSlide,
  deleteScenarioAiElementFromSlide,
  reorderScenarioAiElementInSlide,
  touchSlide,
  updateScenarioAiElementInSlide,
} from './handlers/slide';
import { applyScenarioAiTemplate } from './handlers/template';
import {
  applyScenarioAiProjectPresentation,
  applyScenarioAiSlideClicks,
  applyScenarioAiSlideLayout,
} from './handlers/presentation';
import {
  parseScenarioAiOperationsResponse,
  validateScenarioAiOperations,
  type ScenarioAiValidationFailure,
} from './validate';

export type ScenarioAiApplyResult =
  | {
      appliedOperations: ScenarioAiOperation[];
      project: ScenarioProjectV3;
      status: 'applied';
    }
  | {
      failures: ScenarioAiValidationFailure[];
      project: ScenarioProjectV3;
      status: 'rejected';
    };

type ScenarioAiElementOperation = Extract<
  ScenarioAiOperation,
  {
    type:
      | 'addElement'
      | 'deleteElement'
      | 'editImageTransform'
      | 'reorderElement'
      | 'setElementAnimation'
      | 'setElementBuild'
      | 'updateElement';
  }
>;

export function applyScenarioAiOperations(args: {
  project: ScenarioProjectV3;
  response: unknown;
  templates: readonly ScenarioTemplateDefinition[];
}): ScenarioAiApplyResult {
  const parsed = parseScenarioAiOperationsResponse(args.response);
  if (parsed.status === 'invalid') {
    return { failures: parsed.failures, project: args.project, status: 'rejected' };
  }

  const validated = validateScenarioAiOperations({
    operations: parsed.operations,
    project: args.project,
    templates: args.templates,
  });
  if (validated.status === 'invalid') {
    return { failures: validated.failures, project: args.project, status: 'rejected' };
  }

  return {
    appliedOperations: validated.operations,
    project: applyScenarioAiOperationBatch(args.project, validated.operations, args.templates),
    status: 'applied',
  };
}

function applyScenarioAiOperationBatch(
  project: ScenarioProjectV3,
  operations: ScenarioAiOperation[],
  templates: readonly ScenarioTemplateDefinition[]
): ScenarioProjectV3 {
  const presentation = applyScenarioAiProjectPresentation(project.presentation, operations);

  return {
    ...project,
    presentation,
    slides: operations.reduce(
      (slides, operation) =>
        slides.map((slide) =>
          'slideId' in operation && slide.id === operation.slideId
            ? applyScenarioAiOperation(slide, operation, templates)
            : slide
        ),
      project.slides
    ),
    updatedAt: Date.now(),
  };
}

function applyScenarioAiOperation(
  slide: ScenarioProjectV3['slides'][number],
  operation: ScenarioAiOperation,
  templates: readonly ScenarioTemplateDefinition[]
) {
  switch (operation.type) {
    case 'setProjectPresentation':
      return slide;
    case 'setSlideTitle':
    case 'setSlideNotes':
    case 'setSlideCanvas':
    case 'setSlideLayout':
    case 'setSlideTransition':
    case 'setSlideBackgroundTransition':
    case 'setSlideClicks':
      return applyScenarioAiSlideSetting(slide, operation);
    case 'setSlideTemplate':
      return applyScenarioAiSlideTemplate(slide, operation, templates);
    case 'addElement':
    case 'updateElement':
    case 'deleteElement':
    case 'reorderElement':
    case 'setElementBuild':
    case 'setElementAnimation':
    case 'editImageTransform':
      return applyScenarioAiElementOperation(slide, operation);
  }
}

function applyScenarioAiSlideSetting(
  slide: ScenarioProjectV3['slides'][number],
  operation: Extract<
    ScenarioAiOperation,
    {
      type:
        | 'setSlideBackgroundTransition'
        | 'setSlideCanvas'
        | 'setSlideClicks'
        | 'setSlideLayout'
        | 'setSlideNotes'
        | 'setSlideTitle'
        | 'setSlideTransition';
    }
  >
) {
  switch (operation.type) {
    case 'setSlideTitle':
      return touchSlide({ ...slide, title: operation.title });
    case 'setSlideNotes':
      return touchSlide({ ...slide, notes: operation.notes });
    case 'setSlideCanvas':
      return applyScenarioAiCanvasPatch(slide, operation.canvasPatch);
    case 'setSlideLayout':
      return applyScenarioAiSlideLayout(slide, operation);
    case 'setSlideTransition':
      return touchSlide({ ...slide, transition: operation.transition });
    case 'setSlideBackgroundTransition':
      return touchSlide({ ...slide, backgroundTransition: operation.backgroundTransition });
    case 'setSlideClicks':
      return applyScenarioAiSlideClicks(slide, operation);
  }
}

function applyScenarioAiSlideTemplate(
  slide: ScenarioProjectV3['slides'][number],
  operation: Extract<ScenarioAiOperation, { type: 'setSlideTemplate' }>,
  templates: readonly ScenarioTemplateDefinition[]
) {
  const template = templates.find((candidate) => candidate.templateId === operation.templateId);
  return template
    ? (applyScenarioAiTemplate({ confirmed: true, slide, template }) ?? slide)
    : slide;
}

function applyScenarioAiElementOperation(
  slide: ScenarioProjectV3['slides'][number],
  operation: ScenarioAiElementOperation
) {
  switch (operation.type) {
    case 'addElement':
      return addScenarioAiElementToSlide({
        element: operation.element,
        slide,
        ...(operation.position !== undefined ? { position: operation.position } : {}),
      });
    case 'updateElement':
      return updateScenarioAiElementInSlide({
        elementId: operation.elementId,
        patch: operation.patch,
        slide,
      });
    case 'deleteElement':
      return deleteScenarioAiElementFromSlide({ elementId: operation.elementId, slide });
    case 'reorderElement':
      return reorderScenarioAiElementInSlide({
        elementId: operation.elementId,
        position: operation.position,
        slide,
      });
    case 'setElementBuild':
      return applyScenarioAiElementPatch(slide, operation.elementId, {
        build: operation.build,
      });
    case 'setElementAnimation':
      return applyScenarioAiElementPatch(slide, operation.elementId, {
        animation: operation.animation,
      });
    case 'editImageTransform':
      return applyScenarioAiElementPatch(slide, operation.elementId, {
        contentTransform: operation.contentTransform,
      });
  }
}

function applyScenarioAiElementPatch(
  slide: ScenarioProjectV3['slides'][number],
  elementId: string,
  patch: Extract<ScenarioAiOperation, { type: 'updateElement' }>['patch']
) {
  return updateScenarioAiElementInSlide({ elementId, patch, slide });
}
