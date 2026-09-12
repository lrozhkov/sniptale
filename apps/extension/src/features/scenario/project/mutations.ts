import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import type {
  GuideBlock,
  GuideBlockWidth,
  GuideProject,
  GuideStep,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import { createGuideParagraphs, createGuideStep } from './factories';

type ItemOperation =
  | { kind: 'move-item'; itemId: string; direction: -1 | 1 }
  | { kind: 'duplicate-item' | 'remove-item'; itemId: string };
type BlockOperation =
  | {
      kind: 'add-block';
      itemId: string;
      blockKind: 'text' | 'heading' | 'note' | 'image-slot';
      beforeBlockId?: string;
    }
  | { kind: 'reorder-block'; itemId: string; blockId: string; beforeBlockId?: string }
  | { kind: 'set-block-width'; itemId: string; blockId: string; width: GuideBlockWidth }
  | { kind: 'move-block'; itemId: string; blockId: string; direction: -1 | 1 }
  | { kind: 'duplicate-block' | 'remove-block'; itemId: string; blockId: string };

/** Semantic guide changes never acquire or delete media; images retain immutable project refs. */
export type GuideStructureOperation =
  | ItemOperation
  | BlockOperation
  | ({ kind: 'place-image'; sourceBlockId: string } & (
      | { itemId: string; blockId?: string; beforeItemId?: never }
      | { itemId?: never; blockId?: never; beforeItemId?: string }
    ))
  | { kind: 'add-step'; beforeItemId?: string }
  | { kind: 'add-section'; beforeItemId?: string }
  | { kind: 'merge-next'; itemId: string }
  | { kind: 'split-step'; itemId: string; blockId: string };

/** Returns a detached, validated result; an invalid operation leaves the supplied buffer intact. */
export function applyGuideStructureOperation(
  project: GuideProject,
  operation: GuideStructureOperation
): GuideProject {
  if (
    project.purpose === 'step-template' &&
    operation.kind === 'place-image' &&
    !operation.itemId
  ) {
    operation = {
      kind: 'place-image',
      sourceBlockId: operation.sourceBlockId,
      itemId: project.items[0]!.id,
    };
  }
  const next = structuredClone(project);
  switch (operation.kind) {
    case 'place-image':
      placeImage(next, operation);
      break;
    case 'add-step':
      next.items.splice(insertionIndex(next.items, operation.beforeItemId), 0, createGuideStep());
      break;
    case 'add-section':
      next.items.splice(insertionIndex(next.items, operation.beforeItemId), 0, {
        kind: 'section',
        id: crypto.randomUUID(),
        title: '',
        paragraphs: createGuideParagraphs(''),
      });
      break;
    case 'merge-next':
      mergeSteps(next, operation.itemId);
      break;
    case 'split-step':
      splitStep(next, operation.itemId, operation.blockId);
      break;
    case 'move-item':
    case 'duplicate-item':
    case 'remove-item':
      changeItems(next, operation);
      break;
    case 'add-block':
    case 'reorder-block':
    case 'set-block-width':
    case 'move-block':
    case 'duplicate-block':
    case 'remove-block':
      changeBlocks(next, operation);
  }
  const parsed = parseGuideProject(next);
  if (parsed.status !== 'ok') throw new Error('Guide content limits exceeded.');
  return parsed.project;
}

function insertionIndex(entries: { id: string }[], beforeId: string | undefined): number {
  if (beforeId === undefined) return entries.length;
  const index = entries.findIndex((entry) => entry.id === beforeId);
  if (index < 0) throw new Error('Guide insertion target is unavailable.');
  return index;
}

function requireItemIndex(project: GuideProject, id: string): number {
  const index = project.items.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Guide item is unavailable.');
  return index;
}

function requireStep(project: GuideProject, id: string): GuideStep {
  const item = project.items[requireItemIndex(project, id)];
  if (item?.kind !== 'step') throw new Error('Guide step is unavailable.');
  return item;
}

function moveEntry<T>(entries: T[], index: number, direction: -1 | 1): void {
  const target = index + direction;
  if (index < 0 || target < 0 || target >= entries.length)
    throw new Error('Guide move is unavailable.');
  const entry = entries[index];
  if (entry === undefined) throw new Error('Guide entry is unavailable.');
  entries.splice(index, 1);
  entries.splice(target, 0, entry);
}

function changeItems(project: GuideProject, operation: ItemOperation): void {
  const index = requireItemIndex(project, operation.itemId);
  if (operation.kind === 'move-item') {
    moveEntry(project.items, index, operation.direction);
    return;
  }
  if (operation.kind === 'remove-item') {
    project.items.splice(index, 1);
    return;
  }
  const original = project.items[index];
  if (!original) throw new Error('Guide item is unavailable.');
  const copy = structuredClone(original);
  copy.id = crypto.randomUUID();
  if (copy.kind === 'step')
    copy.blocks.forEach((block) => {
      block.id = crypto.randomUUID();
    });
  project.items.splice(index + 1, 0, copy);
}

function createBlock(kind: 'text' | 'heading' | 'note' | 'image-slot'): GuideBlock {
  const id = crypto.randomUUID();
  if (kind === 'image-slot')
    return { kind, id, frame: { width: 960, height: 540 }, fit: 'contain', alt: '', caption: '' };
  if (kind === 'heading') return { kind, id, text: '' };
  if (kind === 'note') return { kind, id, tone: 'info', paragraphs: createGuideParagraphs('') };
  return { kind, id, paragraphs: createGuideParagraphs('') };
}

function changeBlocks(project: GuideProject, operation: BlockOperation): void {
  const step = requireStep(project, operation.itemId);
  if (operation.kind === 'add-block') {
    step.blocks.splice(
      insertionIndex(step.blocks, operation.beforeBlockId),
      0,
      createBlock(operation.blockKind)
    );
    return;
  }
  const index = step.blocks.findIndex((block) => block.id === operation.blockId);
  const block = step.blocks[index];
  if (!block) throw new Error('Guide block is unavailable.');
  if (operation.kind === 'reorder-block') {
    const target = insertionIndex(step.blocks, operation.beforeBlockId);
    if (index === target || index + 1 === target) return;
    step.blocks.splice(index, 1);
    step.blocks.splice(target > index ? target - 1 : target, 0, block);
    return;
  }
  if (operation.kind === 'set-block-width') {
    block.width = operation.width;
    return;
  }
  if (operation.kind === 'move-block') {
    moveEntry(step.blocks, index, operation.direction);
    return;
  }
  if (operation.kind === 'remove-block') {
    step.blocks.splice(index, 1);
    return;
  }
  step.blocks.splice(index + 1, 0, { ...structuredClone(block), id: crypto.randomUUID() });
}

function mergeSteps(project: GuideProject, itemId: string): void {
  const index = requireItemIndex(project, itemId);
  const step = requireStep(project, itemId);
  const next = project.items[index + 1];
  if (next?.kind !== 'step') throw new Error('No adjacent step to merge.');
  if (next.title) step.blocks.push({ kind: 'heading', id: crypto.randomUUID(), text: next.title });
  step.blocks.push(...next.blocks);
  project.items.splice(index + 1, 1);
}

function splitStep(project: GuideProject, itemId: string, blockId: string): void {
  const index = requireItemIndex(project, itemId);
  const step = requireStep(project, itemId);
  const boundary = step.blocks.findIndex((block) => block.id === blockId);
  if (boundary <= 0) throw new Error('No preceding content to split.');
  const following = createGuideStep();
  following.blocks = step.blocks.splice(boundary);
  following.layout = step.layout;
  following.templateId = step.templateId;
  following.styleOverrides = { ...step.styleOverrides };
  project.items.splice(index + 1, 0, following);
}

function placeImage(
  project: GuideProject,
  operation: Extract<GuideStructureOperation, { kind: 'place-image' }>
): void {
  const source = project.items
    .flatMap((item) => (item.kind === 'step' ? item.blocks : []))
    .find((block) => block.id === operation.sourceBlockId);
  if (source?.kind !== 'image') throw new Error('Guide image source is unavailable.');
  const copy = structuredClone(source);
  if (operation.itemId === undefined) {
    const step = createGuideStep();
    step.blocks.push({ ...copy, id: crypto.randomUUID() });
    project.items.splice(insertionIndex(project.items, operation.beforeItemId), 0, step);
    return;
  }
  const step = requireStep(project, operation.itemId);
  if (operation.blockId === undefined) {
    step.blocks.push({ ...copy, id: crypto.randomUUID() });
    return;
  }
  const index = step.blocks.findIndex((block) => block.id === operation.blockId);
  const target = step.blocks[index];
  if (target?.kind !== 'image' && target?.kind !== 'image-slot')
    throw new Error('Guide image target is unavailable.');
  delete copy.width;
  step.blocks[index] = {
    ...copy,
    id: target.id,
    ...(target.width ? { width: target.width } : {}),
    frame: { ...target.frame },
    fit: target.fit,
    alt: target.alt,
    caption: target.caption,
    contentTransform: { x: 0, y: 0, scale: 1 },
  };
}
