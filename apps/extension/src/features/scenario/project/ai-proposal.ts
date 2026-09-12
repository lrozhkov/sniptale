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

/** An empty block selection selects every editable text field in the selected steps. */
export type GuideAiScope = { stepIds: string[]; blockIds: string[] };
export type GuideAiChange = { operation: ScenarioAiOperation; before: string; after: string };
type AiTextBlock =
  | {
      id: string;
      kind: 'image';
      caption: string;
      alt: string;
      actionContext?: Omit<GuideVideoAction, 'id'>;
    }
  | { id: string; kind: 'heading' | 'text' | 'note'; text: string };

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
    if (
      !steps.some((step) =>
        step.blocks.some((block) => block.id === id && block.kind !== 'image-slot')
      )
    )
      throw new Error('Invalid AI block selection.');
  }
  return steps;
}

function plainText(block: Extract<GuideBlock, { kind: 'text' | 'note' }>): string {
  return block.paragraphs
    .map((paragraph) => paragraph.runs.map((run) => run.text).join(''))
    .join('\n');
}

/** Projects selected editable text only; image resources stay outside the serializable snapshot. */
export function selectGuideAiContent(project: GuideProject, scope: GuideAiScope) {
  const images: Array<{ stepId: string; stepNumber: number; block: GuideImageBlock }> = [];
  const allSteps = project.items.filter((item) => item.kind === 'step');
  const steps = selectedSteps(project, scope).map((step) => {
    const blocks = step.blocks
      .filter((block) => !scope.blockIds.length || scope.blockIds.includes(block.id))
      .flatMap<AiTextBlock>((block) => {
        if (block.kind === 'image-slot') return [];
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
            text: block.kind === 'heading' ? block.text : plainText(block),
          },
        ];
      });
    return { id: step.id, ...(!scope.blockIds.length ? { title: step.title } : {}), blocks };
  });
  return { snapshot: { steps }, images };
}

function changeBlock(
  block: GuideBlock,
  operation: Exclude<ScenarioAiOperation, { type: 'setStepTitle' }>
): { block: GuideBlock; before: string } {
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
        (operation.type === 'setStepTitle' || !scope.blockIds.includes(operation.blockId)))
    )
      throw new Error('AI proposal is outside its selection.');
    const key = JSON.stringify([
      operation.stepId,
      operation.type,
      operation.type === 'setStepTitle' ? null : operation.blockId,
    ]);
    if (targets.has(key)) throw new Error('Duplicate AI proposal target.');
    targets.add(key);
    const { before } = changeStep(step, operation);
    return {
      operation,
      before,
      after: operation.type === 'setStepTitle' ? operation.title : operation.text,
    };
  });
}

/** Applies a user-selected, revalidated subset without changing resource or presentation metadata. */
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
