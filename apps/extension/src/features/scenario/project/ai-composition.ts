import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import type { ScenarioAiOperation } from '@sniptale/runtime-contracts/scenario-ai-operations';
import type {
  GuideBlock,
  GuideProject,
  GuideStep,
} from '@sniptale/runtime-contracts/scenario/types/guide';

type CompositionOperation = Extract<
  ScenarioAiOperation,
  { type: 'replaceStructure' | 'replaceStep' | 'replaceBlock' | 'setDocumentParameters' }
>;
type ProposedStep = Extract<CompositionOperation, { type: 'replaceStep' }>['step'];

/** Hydrates only references already authorized in the original request; never acquires media. */
function hydrateStep(
  project: GuideProject,
  step: ProposedStep,
  authorizedStepIds: string[]
): GuideStep {
  const original = project.items.find((item) => item.id === step.id);
  const blocks = step.blocks.map((block): GuideBlock => {
    if (block.kind !== 'image') return structuredClone(block);
    const source = project.items
      .flatMap((item) =>
        item.kind === 'step' && authorizedStepIds.includes(item.id) ? item.blocks : []
      )
      .find((item) => item.id === block.sourceBlockId);
    if (source?.kind !== 'image') throw new Error('AI image reference is unavailable.');
    const { sourceBlockId: _, ...presentation } = block;
    return {
      ...structuredClone(presentation),
      assetId: source.assetId,
      galleryAssetId: source.galleryAssetId,
      editDocumentId: source.editDocumentId,
      source: structuredClone(source.source),
    };
  });
  return {
    ...structuredClone(step),
    templateId:
      original?.kind === 'step' && original.layout === step.layout
        ? original.templateId
        : `builtin:${step.layout}`,
    blocks,
  };
}

/** Validates the complete detached result; invalid composition never publishes partial changes. */
export function applyGuideAiComposition(
  project: GuideProject,
  operation: CompositionOperation,
  scope: { stepIds: string[]; blockIds: string[]; document?: boolean | undefined },
  basis: GuideProject = project
): GuideProject {
  if (scope.blockIds.length && operation.type !== 'replaceBlock')
    throw new Error('AI composition is outside its selection.');
  let next: unknown;
  if (operation.type === 'replaceBlock') {
    const current = project.items.find((item) => item.id === operation.stepId);
    if (
      current?.kind !== 'step' ||
      !scope.stepIds.includes(current.id) ||
      operation.block.id !== operation.blockId ||
      !current.blocks.some((block) => block.id === operation.blockId) ||
      (scope.blockIds.length && !scope.blockIds.includes(operation.blockId))
    )
      throw new Error('AI block composition is outside its selection.');
    if (
      operation.block.kind === 'image' &&
      scope.blockIds.length &&
      !scope.blockIds.includes(operation.block.sourceBlockId)
    )
      throw new Error('AI image reference is outside its selection.');
    const hydrated = hydrateStep(basis, { ...current, blocks: [operation.block] }, scope.stepIds)
      .blocks[0]!;
    next = {
      ...project,
      items: project.items.map((item) =>
        item.id === current.id
          ? {
              ...current,
              blocks: current.blocks.map((block) =>
                block.id === operation.blockId ? hydrated : block
              ),
            }
          : item
      ),
    };
  } else if (operation.type === 'replaceStep') {
    if (!scope.stepIds.includes(operation.stepId) || operation.step.id !== operation.stepId)
      throw new Error('AI composition is outside its selection.');
    const step = hydrateStep(basis, operation.step, scope.stepIds);
    next = { ...project, items: project.items.map((item) => (item.id === step.id ? step : item)) };
  } else {
    if (!scope.document) throw new Error('AI document changes require document scope.');
    next =
      operation.type === 'setDocumentParameters'
        ? { ...project, ...operation.parameters }
        : {
            ...project,
            items: operation.items.map((item) =>
              item.kind === 'step' ? hydrateStep(basis, item, scope.stepIds) : structuredClone(item)
            ),
          };
  }
  const parsed = parseGuideProject(next);
  if (parsed.status !== 'ok') throw new Error('AI composition is invalid.');
  return parsed.project;
}
