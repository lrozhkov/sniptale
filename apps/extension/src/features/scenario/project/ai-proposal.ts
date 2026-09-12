import {
  guideStepParametersSchema,
  guideBlockParameterSchemas,
} from '@sniptale/runtime-contracts/scenario/guide-parser';
import { applyGuideLayout } from './layout';
import type {
  GuideBlock,
  GuideVideoAction,
  GuideImageBlock,
  GuideProject,
  GuideStep,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  scenarioAiOperationsResponseSchema,
  type ScenarioAiOperation,
} from '@sniptale/runtime-contracts/scenario-ai-operations';
import { createGuideParagraphs } from './factories';

/** An empty block selection selects content and presentation in the selected steps. */
export type GuideAiScope = { stepIds: string[]; blockIds: string[] };
export type GuideAiChange = { operation: ScenarioAiOperation; before: string; after: string };
type BlockParameters = ReturnType<
  (typeof guideBlockParameterSchemas)[keyof typeof guideBlockParameterSchemas]['parse']
>;
type AiTextBlock =
  | {
      id: string;
      kind: 'image';
      parameters: BlockParameters;
      caption: string;
      alt: string;
      actionContext?: Omit<GuideVideoAction, 'id'>;
    }
  | { id: string; kind: 'heading' | 'text' | 'note'; text: string; parameters: BlockParameters }
  | { id: string; kind: 'image-slot'; parameters: BlockParameters };

function selectedSteps(project: GuideProject, scope: GuideAiScope): GuideStep[] {
  const ids = new Set(scope.stepIds);
  const steps = project.items.filter(
    (item): item is GuideStep => item.kind === 'step' && ids.has(item.id)
  );
  const blocks = new Set(scope.blockIds);
  if (
    !ids.size ||
    ids.size !== scope.stepIds.length ||
    steps.length !== ids.size ||
    blocks.size !== scope.blockIds.length
  )
    throw new Error('Invalid AI selection.');
  for (const id of blocks) {
    if (!steps.some((step) => step.blocks.some((block) => block.id === id)))
      throw new Error('Invalid AI block selection.');
  }
  return steps;
}

function plainText(block: Extract<GuideBlock, { kind: 'text' | 'note' }>): string {
  return block.paragraphs
    .map((paragraph) => paragraph.runs.map((run) => run.text).join(''))
    .join('\n');
}

/** Projects selected content and admitted presentation only; image resources stay outside the serializable snapshot. */
export function selectGuideAiContent(project: GuideProject, scope: GuideAiScope) {
  const images: Array<{ stepId: string; stepNumber: number; block: GuideImageBlock }> = [];
  const allSteps = project.items.filter((item) => item.kind === 'step');
  const steps = selectedSteps(project, scope).map((step) => {
    const blocks = step.blocks
      .filter((block) => !scope.blockIds.length || scope.blockIds.includes(block.id))
      .flatMap<AiTextBlock>((block) => {
        const parameters = guideBlockParameterSchemas[block.kind].strip().parse(block);
        if (block.kind === 'image-slot') return [{ id: block.id, kind: block.kind, parameters }];
        if (block.kind === 'image') {
          images.push({
            stepId: step.id,
            stepNumber: allSteps.findIndex((item) => item.id === step.id) + 1,
            block,
          });
          const action = block.source.kind === 'video-frame' ? block.source.action : undefined;
          return [
            {
              id: block.id,
              kind: block.kind,
              parameters,
              caption: block.caption,
              alt: block.alt,
              ...(action
                ? {
                    actionContext: {
                      kind: action.kind,
                      time: action.time,
                      duration: action.duration,
                      label: action.label,
                      point: action.point,
                      target: action.target,
                    },
                  }
                : {}),
            },
          ];
        }
        return [
          {
            id: block.id,
            kind: block.kind,
            parameters,
            text: block.kind === 'heading' ? block.text : plainText(block),
          },
        ];
      });
    return {
      id: step.id,
      ...(!scope.blockIds.length
        ? { title: step.title, parameters: guideStepParametersSchema.strip().parse(step) }
        : {}),
      blocks,
    };
  });
  return { snapshot: { steps }, images };
}

/** Parsed optional parameters are patches: undefined has the same meaning as omission. */
function mergeParameters<T extends object>(
  value: T,
  patch: Partial<{ [K in keyof T]: T[K] | undefined }>
): T {
  return {
    ...value,
    ...Object.fromEntries(Object.entries(patch).filter(([, item]) => item !== undefined)),
  };
}

function changeBlock(
  block: GuideBlock,
  operation: Exclude<ScenarioAiOperation, { type: 'setStepTitle' | 'setStepParameters' }>
): { block: GuideBlock; before: string } {
  if (operation.type === 'setBlockParameters') {
    const before = JSON.stringify(guideBlockParameterSchemas[block.kind].strip().parse(block));
    switch (block.kind) {
      case 'heading':
        return {
          block: mergeParameters(
            block,
            guideBlockParameterSchemas.heading.parse(operation.parameters)
          ),
          before,
        };
      case 'text':
        return {
          block: mergeParameters(
            block,
            guideBlockParameterSchemas.text.parse(operation.parameters)
          ),
          before,
        };
      case 'note':
        return {
          block: mergeParameters(
            block,
            guideBlockParameterSchemas.note.parse(operation.parameters)
          ),
          before,
        };
      case 'image':
        return {
          block: mergeParameters(
            block,
            guideBlockParameterSchemas.image.parse(operation.parameters)
          ),
          before,
        };
      case 'image-slot':
        return {
          block: mergeParameters(
            block,
            guideBlockParameterSchemas['image-slot'].parse(operation.parameters)
          ),
          before,
        };
    }
  }

  switch (operation.type) {
    case 'setHeading':
      if (block.kind === 'heading')
        return { block: { ...block, text: operation.text }, before: block.text };
      break;
    case 'setText':
    case 'setNote':
      if (
        block.kind === (operation.type === 'setText' ? 'text' : 'note') &&
        (block.kind === 'text' || block.kind === 'note')
      )
        return {
          block: { ...block, paragraphs: createGuideParagraphs(operation.text) },
          before: plainText(block),
        };
      break;
    case 'setImageCaption':
    case 'setImageAlt':
      if (block.kind === 'image') {
        const field = operation.type === 'setImageCaption' ? 'caption' : 'alt';
        return { block: { ...block, [field]: operation.text }, before: block[field] };
      }
  }
  throw new Error('AI proposal target kind mismatch.');
}

function changeStep(
  step: GuideStep,
  operation: ScenarioAiOperation
): { step: GuideStep; before: string } {
  if (operation.type === 'setStepTitle')
    return { step: { ...step, title: operation.title }, before: step.title };
  if (operation.type === 'setStepParameters')
    return {
      step: mergeParameters(
        operation.parameters.layout ? applyGuideLayout(step, operation.parameters.layout) : step,
        operation.parameters
      ),
      before: JSON.stringify(guideStepParametersSchema.strip().parse(step)),
    };
  const block = step.blocks.find((block) => block.id === operation.blockId);
  if (!block) throw new Error('AI proposal target missing.');
  const changed = changeBlock(block, operation);
  return {
    step: {
      ...step,
      blocks: step.blocks.map((block) => (block.id === operation.blockId ? changed.block : block)),
    },
    before: changed.before,
  };
}

/** Admits the entire proposal atomically before exposing any operation for optional acceptance. */
export function prepareGuideAiProposal(
  project: GuideProject,
  scope: GuideAiScope,
  rawOperations: unknown
): GuideAiChange[] {
  const { operations } = scenarioAiOperationsResponseSchema.parse({ operations: rawOperations });
  const steps = selectedSteps(project, scope);
  const targets = new Set<string>();
  return operations.map((operation) => {
    const step = steps.find((step) => step.id === operation.stepId);
    if (
      !step ||
      (scope.blockIds.length > 0 &&
        (operation.type === 'setStepTitle' ||
          operation.type === 'setStepParameters' ||
          !scope.blockIds.includes(operation.blockId)))
    )
      throw new Error('AI proposal is outside its selection.');
    const key = JSON.stringify([
      operation.stepId,
      operation.type,
      'blockId' in operation ? operation.blockId : null,
    ]);
    if (targets.has(key)) throw new Error('Duplicate AI proposal target.');
    targets.add(key);
    const { before } = changeStep(step, operation);
    return {
      operation,
      before,
      after:
        'parameters' in operation
          ? JSON.stringify(operation.parameters)
          : operation.type === 'setStepTitle'
            ? operation.title
            : operation.text,
    };
  });
}

/** Applies a user-selected, revalidated subset without changing resource identity or capture metadata. */
export function applyGuideAiProposal(
  project: GuideProject,
  scope: GuideAiScope,
  rawOperations: unknown
): GuideProject {
  const changes = prepareGuideAiProposal(project, scope, rawOperations);
  if (!changes.length) return project;
  let items = project.items;
  for (const { operation } of changes) {
    items = items.map((item) =>
      item.kind === 'step' && item.id === operation.stepId ? changeStep(item, operation).step : item
    );
  }
  return { ...project, items };
}
