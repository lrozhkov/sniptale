import type { CompactCommand } from '../../inspector/compact';
import { translate } from '../../../platform/i18n';
import type { EditorToolbarSelectionState } from '../toolbar/types';
import { TablerIcon } from '../../inspector/compact/tabler-icon';
import { isArrowToolbarCommandSet, sortArrowToolbarGroups } from './arrow-toolbar-groups';
import { isBlurToolbarCommandSet, sortBlurToolbarGroups } from './blur-toolbar-groups';
import { isBrushToolbarCommandSet, sortBrushToolbarGroups } from './brush-toolbar-groups';
import { isLineToolbarCommandSet, sortLineToolbarGroups } from './line-toolbar-groups';
import {
  createImageToolbarGroups,
  isImageToolbarCommandSet,
  sortImageToolbarGroups,
} from './image-toolbar-groups';
import { isShapeToolbarCommandSet, sortShapeToolbarGroups } from './shape-toolbar-groups';
import { isStepToolbarCommandSet, sortStepToolbarGroups } from './step-toolbar-groups';
import { isTextToolbarCommandSet, sortTextToolbarGroups } from './text-toolbar-groups';
import { createCanvasToolbarImageGeometryGroup } from './canvas-toolbar-image-geometry';
import {
  buildCanvasToolbarMoreContent,
  createCanvasToolbarEffectsGroup,
  type CanvasToolbarActionHandlers,
} from './canvas-toolbar-menu';
import {
  CANVAS_TOOLBAR_GROUP_TITLES,
  CANVAS_TOOLBAR_GROUP_WIDTHS,
  type FloatingToolbarGroup,
  getCanvasToolbarGroupTrigger,
} from './canvas-toolbar-model';
import type { EditorFloatingDocumentController } from './document-bar';
import { createLayerToolbarCommandGroups, sortLayerToolbarGroups } from './layer-toolbar-groups';

export type { FloatingToolbarGroup } from './canvas-toolbar-model';

function createMoreGroup(args: {
  documentController: EditorFloatingDocumentController;
  hasEffectsGroup: boolean;
  handlers: CanvasToolbarActionHandlers;
  selection: EditorToolbarSelectionState;
}): FloatingToolbarGroup {
  return {
    id: 'more',
    kind: 'more',
    title: CANVAS_TOOLBAR_GROUP_TITLES.more,
    trigger: getCanvasToolbarGroupTrigger('more', []) ?? <TablerIcon icon="tabler:dots-vertical" />,
    content: buildCanvasToolbarMoreContent(args),
    width: CANVAS_TOOLBAR_GROUP_WIDTHS.more,
  };
}

function createLayerLockGroup(args: {
  handlers: CanvasToolbarActionHandlers;
  selection: EditorToolbarSelectionState;
}): FloatingToolbarGroup | null {
  const selectedLayerId = args.selection.selectedObjectId ?? null;
  if (!selectedLayerId) {
    return null;
  }

  const locked = Boolean(args.selection.selectedObjectLocked);
  return {
    id: 'layer-lock',
    kind: 'more',
    title: locked ? translate('editor.toolbar.unlockLayer') : translate('editor.toolbar.lockLayer'),
    trigger: <TablerIcon icon={locked ? 'tabler:lock' : 'tabler:lock-open-2'} />,
    content: null,
    active: locked,
    onClick: () => args.handlers.toggleLayerLock(selectedLayerId),
    width: CANVAS_TOOLBAR_GROUP_WIDTHS.more,
  };
}

function resolveVisibleGroups(args: {
  commandGroups: FloatingToolbarGroup[];
  documentController: EditorFloatingDocumentController;
  handlers: CanvasToolbarActionHandlers;
  isArrowToolbar: boolean;
  isBlurToolbar: boolean;
  isBrushToolbar: boolean;
  isLineToolbar: boolean;
  isImageToolbar: boolean;
  isShapeToolbar: boolean;
  isStepToolbar: boolean;
  isTextToolbar: boolean;
  selection: EditorToolbarSelectionState;
}) {
  const effectsGroup =
    args.isBrushToolbar ||
    args.isBlurToolbar ||
    args.isLineToolbar ||
    args.isImageToolbar ||
    args.isArrowToolbar ||
    args.isShapeToolbar ||
    args.isStepToolbar ||
    args.isTextToolbar ||
    args.commandGroups.some((group) => group.kind === 'effects') ||
    !args.selection.selectedObjectId
      ? null
      : createCanvasToolbarEffectsGroup({
          handlers: args.handlers,
          selection: args.selection,
        });
  const imageGeometryGroup =
    args.selection.selectedObjectType === 'image' && !args.isImageToolbar
      ? createCanvasToolbarImageGeometryGroup({
          documentController: args.documentController,
          selection: args.selection,
        })
      : null;

  return [
    ...args.commandGroups.filter((group) => !(imageGeometryGroup && group.kind === 'geometry')),
    imageGeometryGroup,
    effectsGroup,
  ].filter((group): group is FloatingToolbarGroup => group !== null);
}

function resolveToolbarCommandSetFlags(commands: CompactCommand[]) {
  return {
    isArrowToolbar: isArrowToolbarCommandSet(commands),
    isBlurToolbar: isBlurToolbarCommandSet(commands),
    isBrushToolbar: isBrushToolbarCommandSet(commands),
    isImageToolbar: isImageToolbarCommandSet(commands),
    isLineToolbar: isLineToolbarCommandSet(commands),
    isShapeToolbar: isShapeToolbarCommandSet(commands),
    isStepToolbar: isStepToolbarCommandSet(commands),
    isTextToolbar: isTextToolbarCommandSet(commands),
  };
}

function sortCanvasToolbarGroups(
  groups: FloatingToolbarGroup[],
  flags: ReturnType<typeof resolveToolbarCommandSetFlags>
) {
  if (flags.isBrushToolbar) {
    return sortBrushToolbarGroups(groups);
  }
  if (flags.isBlurToolbar) {
    return sortBlurToolbarGroups(groups);
  }
  if (flags.isLineToolbar) {
    return sortLineToolbarGroups(groups);
  }
  if (flags.isImageToolbar) {
    return sortImageToolbarGroups(groups);
  }
  if (flags.isArrowToolbar) {
    return sortArrowToolbarGroups(groups);
  }
  if (flags.isShapeToolbar) {
    return sortShapeToolbarGroups(groups);
  }
  if (flags.isStepToolbar) {
    return sortStepToolbarGroups(groups);
  }
  if (flags.isTextToolbar) {
    return sortTextToolbarGroups(groups);
  }

  return sortLayerToolbarGroups(groups);
}

function placeUtilityGroups(groups: FloatingToolbarGroup[]): FloatingToolbarGroup[] {
  const lockGroup = groups.find((group) => group.id === 'layer-lock') ?? null;
  const remainingGroups = groups.filter((group) => group.id !== 'layer-lock');
  if (!lockGroup) {
    return remainingGroups;
  }

  const moreIndex = remainingGroups.findIndex((group) => group.id === 'more');
  if (moreIndex === -1) {
    return [...remainingGroups, lockGroup];
  }

  return [...remainingGroups.slice(0, moreIndex), lockGroup, ...remainingGroups.slice(moreIndex)];
}

export function buildCanvasSelectionToolbarGroups(args: {
  commands: CompactCommand[];
  documentController: EditorFloatingDocumentController;
  handlers: CanvasToolbarActionHandlers;
  selection: EditorToolbarSelectionState;
}): FloatingToolbarGroup[] {
  const flags = resolveToolbarCommandSetFlags(args.commands);
  const commandGroups = flags.isImageToolbar
    ? (createImageToolbarGroups(args.commands) ?? [])
    : createLayerToolbarCommandGroups(args.commands);
  const visibleGroups = resolveVisibleGroups({
    ...args,
    commandGroups,
    ...flags,
  });
  const mutableVisibleGroups = args.selection.selectedObjectLocked
    ? visibleGroups.map((group) => ({ ...group, disabled: true }))
    : visibleGroups;
  const hasEffectsGroup = visibleGroups.some((group) => group.kind === 'effects');

  const groups = [
    ...mutableVisibleGroups,
    createLayerLockGroup({
      handlers: args.handlers,
      selection: args.selection,
    }),
    createMoreGroup({
      documentController: args.documentController,
      hasEffectsGroup,
      handlers: args.handlers,
      selection: args.selection,
    }),
  ].filter((group): group is FloatingToolbarGroup => group !== null);

  return placeUtilityGroups(sortCanvasToolbarGroups(groups, flags));
}
