import { applyScenarioTemplateToSlide } from '../../../../features/scenario/project/v3/templates';
import type {
  ScenarioElement,
  ScenarioProjectV3,
  ScenarioSlide,
  ScenarioTemplateDefinition,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioAiOperation } from '@sniptale/runtime-contracts/scenario-ai-operations';
import { scenarioAiOperationsResponseSchema } from '@sniptale/runtime-contracts/scenario-ai-operations';

export interface ScenarioAiValidationFailure {
  index: number;
  message: string;
}

export type ScenarioAiValidationResult =
  | {
      operations: ScenarioAiOperation[];
      status: 'valid';
    }
  | {
      failures: ScenarioAiValidationFailure[];
      status: 'invalid';
    };

export function parseScenarioAiOperationsResponse(value: unknown): ScenarioAiValidationResult {
  const result = scenarioAiOperationsResponseSchema.safeParse(value);
  if (!result.success) {
    return {
      failures: [{ index: -1, message: result.error.issues[0]?.message ?? 'Invalid AI response' }],
      status: 'invalid',
    };
  }

  return { operations: result.data.operations, status: 'valid' };
}

export function validateScenarioAiOperations(args: {
  operations: ScenarioAiOperation[];
  project: ScenarioProjectV3;
  templates: readonly ScenarioTemplateDefinition[];
}): ScenarioAiValidationResult {
  const failures = args.operations.flatMap((operation, index) =>
    validateScenarioAiOperation({ ...args, index, operation })
  );

  return failures.length > 0
    ? { failures, status: 'invalid' }
    : { operations: args.operations, status: 'valid' };
}

function validateScenarioAiOperation(args: {
  index: number;
  operation: ScenarioAiOperation;
  project: ScenarioProjectV3;
  templates: readonly ScenarioTemplateDefinition[];
}): ScenarioAiValidationFailure[] {
  if (args.operation.type === 'setProjectPresentation') {
    return [];
  }

  const slide = findSlide(args.project, args.operation.slideId);
  if (!slide) {
    return [createFailure(args.index, `Unknown slide id: ${args.operation.slideId}`)];
  }

  if (args.operation.type === 'addElement') {
    return validateAddElement(args.index, slide, args.operation.position);
  }
  if (args.operation.type === 'setSlideTemplate') {
    return validateTemplateOperation(
      { index: args.index, operation: args.operation, templates: args.templates },
      slide
    );
  }
  if ('elementId' in args.operation) {
    return validateElementOperation(args.index, slide, args.operation);
  }

  return [];
}

function validateAddElement(
  index: number,
  slide: ScenarioSlide,
  position: number | undefined
): ScenarioAiValidationFailure[] {
  if (position !== undefined && position > slide.elements.length) {
    return [createFailure(index, 'Element insert position is outside the slide layer range')];
  }

  return [];
}

function validateElementOperation(
  index: number,
  slide: ScenarioSlide,
  operation: Extract<ScenarioAiOperation, { elementId: string }>
): ScenarioAiValidationFailure[] {
  const element = slide.elements.find((candidate) => candidate.id === operation.elementId);
  if (!element) {
    return [createFailure(index, `Unknown element id: ${operation.elementId}`)];
  }
  if (operation.type === 'reorderElement' && operation.position >= slide.elements.length) {
    return [createFailure(index, 'Element reorder position is outside the slide layer range')];
  }
  if (operation.type === 'editImageTransform' && element.kind !== 'image') {
    return [createFailure(index, `Element is not an image: ${operation.elementId}`)];
  }
  if (element.locked && !isAllowedLockedElementOperation(operation, element)) {
    return [createFailure(index, `Element is locked: ${operation.elementId}`)];
  }

  return [];
}

function validateTemplateOperation(
  args: {
    index: number;
    operation: Extract<ScenarioAiOperation, { type: 'setSlideTemplate' }>;
    templates: readonly ScenarioTemplateDefinition[];
  },
  slide: ScenarioSlide
): ScenarioAiValidationFailure[] {
  const template = args.templates.find(
    (candidate) => candidate.templateId === args.operation.templateId
  );
  if (!template) {
    return [createFailure(args.index, `Unavailable template id: ${args.operation.templateId}`)];
  }

  const result = applyScenarioTemplateToSlide({
    confirmed: Boolean(args.operation.confirmed),
    slide,
    template,
  });
  return result.status === 'needs-confirmation'
    ? [createFailure(args.index, 'Template application requires confirmation')]
    : [];
}

function isAllowedLockedElementOperation(
  operation: Extract<ScenarioAiOperation, { elementId: string }>,
  element: ScenarioElement
) {
  return (
    operation.type === 'updateElement' &&
    operation.patch.locked === false &&
    Object.keys(operation.patch).length === 1 &&
    element.locked
  );
}

function findSlide(project: ScenarioProjectV3, slideId: string) {
  return project.slides.find((slide) => slide.id === slideId) ?? null;
}

function createFailure(index: number, message: string): ScenarioAiValidationFailure {
  return { index, message };
}
