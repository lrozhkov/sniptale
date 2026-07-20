import { EllipsisVertical } from 'lucide-react';
import type { CompactCommand } from '../../inspector/compact';
import {
  CANVAS_TOOLBAR_GROUP_TITLES,
  type FloatingToolbarGroup,
  type FloatingToolbarGroupKind,
  getCanvasToolbarGroupTrigger,
} from './canvas-toolbar-model';
import { createArrowToolbarGroups } from './arrow-toolbar-groups';
import { createBlurToolbarGroups } from './blur-toolbar-groups';
import { createBrushToolbarGroups } from './brush-toolbar-groups';
import { createLineToolbarGroups } from './line-toolbar-groups';
import { createShapeToolbarGroups } from './shape-toolbar-groups';
import { createStepToolbarGroups } from './step-toolbar-groups';
import { createTextToolbarGroups } from './text-toolbar-groups';
import { createToolbarGroup } from './toolbar-group-builders';

const LAYER_TOOLBAR_GROUP_ORDER: FloatingToolbarGroupKind[] = [
  'templates',
  'fill',
  'stroke',
  'geometry',
  'content',
  'layout',
  'effects',
  'more',
];

function isLayerTemplateCommand(commandId: string): boolean {
  return commandId.includes('template') || commandId.includes('preset');
}

function isLayerContentCommand(commandId: string): boolean {
  return (
    commandId.startsWith('text-font') ||
    commandId === 'text-bold' ||
    commandId === 'text-italic' ||
    commandId === 'text-underline' ||
    commandId === 'text-linethrough' ||
    commandId === 'step-type' ||
    commandId === 'step-value' ||
    commandId === 'step-alphabet' ||
    commandId === 'blur-type' ||
    commandId === 'blur-amount' ||
    commandId.startsWith('crop-')
  );
}

function isLayerColorCommand(commandId: string): boolean {
  return (
    commandId.endsWith('-color') ||
    commandId.includes('fill-color') ||
    commandId === 'text-background' ||
    commandId === 'text-background-opacity' ||
    commandId === 'step-opacity' ||
    commandId === 'rich-shape-fill'
  );
}

function isLayerStrokeCommand(commandId: string): boolean {
  if (
    commandId.includes('dynamic-width') ||
    commandId.includes('shadow') ||
    commandId.includes('roughness') ||
    commandId.includes('bowing')
  ) {
    return false;
  }

  return (
    commandId.includes('stroke') ||
    commandId.endsWith('-width') ||
    commandId.endsWith('-style') ||
    commandId === 'line-style' ||
    commandId === 'rich-shape-line'
  );
}

function isLayerGeometryCommand(commandId: string): boolean {
  if (commandId === 'text-font-size') {
    return false;
  }

  return (
    commandId.endsWith('-radius') ||
    commandId.endsWith('-size') ||
    commandId.includes('dynamic-width') ||
    commandId.includes('-head') ||
    commandId === 'arrow-type' ||
    commandId === 'rich-shape-tail'
  );
}

function isLayerLayoutCommand(commandId: string): boolean {
  return commandId === 'text-align' || commandId === 'text-vertical-align';
}

function isLayerEffectsCommand(commandId: string): boolean {
  return (
    commandId.includes('shadow') ||
    commandId.includes('roughness') ||
    commandId.includes('bowing') ||
    commandId.includes('effects')
  );
}

function resolveLayerCommandKind(commandId: string): FloatingToolbarGroupKind {
  if (isLayerTemplateCommand(commandId)) {
    return 'templates';
  }
  if (isLayerLayoutCommand(commandId)) {
    return 'layout';
  }
  if (isLayerEffectsCommand(commandId)) {
    return 'effects';
  }
  if (isLayerColorCommand(commandId)) {
    return 'fill';
  }
  if (isLayerStrokeCommand(commandId)) {
    return 'stroke';
  }
  if (isLayerGeometryCommand(commandId)) {
    return 'geometry';
  }
  if (isLayerContentCommand(commandId) || commandId === 'rich-shape-text') {
    return 'content';
  }

  return 'more';
}

function groupLayerCommands(commands: CompactCommand[]) {
  const grouped = new Map<FloatingToolbarGroupKind, CompactCommand[]>();

  commands.forEach((command) => {
    const kind = resolveLayerCommandKind(command.id);
    const current = grouped.get(kind) ?? [];
    current.push(command);
    grouped.set(kind, current);
  });

  return grouped;
}

export function sortLayerToolbarGroups(groups: FloatingToolbarGroup[]): FloatingToolbarGroup[] {
  return groups.sort(
    (left, right) =>
      LAYER_TOOLBAR_GROUP_ORDER.indexOf(left.kind) - LAYER_TOOLBAR_GROUP_ORDER.indexOf(right.kind)
  );
}

export function createLayerToolbarCommandGroups(
  commands: CompactCommand[]
): FloatingToolbarGroup[] {
  const specializedGroups =
    createBrushToolbarGroups(commands) ??
    createBlurToolbarGroups(commands) ??
    createLineToolbarGroups(commands) ??
    createArrowToolbarGroups(commands) ??
    createShapeToolbarGroups(commands) ??
    createStepToolbarGroups(commands) ??
    createTextToolbarGroups(commands);
  if (specializedGroups) {
    return specializedGroups;
  }

  const grouped = groupLayerCommands(commands);

  return LAYER_TOOLBAR_GROUP_ORDER.flatMap((kind) => {
    const kindCommands = grouped.get(kind) ?? [];
    if (kindCommands.length === 0 || kind === 'more') {
      return [];
    }

    const group = createToolbarGroup({
      id: kind,
      kind,
      title: CANVAS_TOOLBAR_GROUP_TITLES[kind],
      trigger: getCanvasToolbarGroupTrigger(kind, kindCommands) ?? (
        <EllipsisVertical size={15} strokeWidth={2} />
      ),
      commands: kindCommands,
    });

    return group ? [group] : [];
  });
}
