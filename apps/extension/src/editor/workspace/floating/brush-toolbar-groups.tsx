import { translate } from '../../../platform/i18n';
import type { CompactCommand } from '../../inspector/compact';
import { TablerColorIcon } from '../../inspector/compact/color-icon';
import { TablerIcon } from '../../inspector/compact/tabler-icon';
import {
  CANVAS_TOOLBAR_GROUP_TITLES,
  type FloatingToolbarGroup,
  type FloatingToolbarGroupKind,
} from './canvas-toolbar-model';
import { createToolbarGroup, getToolbarCommand, isToolbarCommand } from './toolbar-group-builders';

type BrushToolbarTool = 'pencil' | 'highlighter';

interface BrushToolbarCommands {
  color: CompactCommand | null;
  dynamicWidth: CompactCommand | null;
  opacity: CompactCommand | null;
  shadow: CompactCommand | null;
  smoothing: CompactCommand | null;
  template: CompactCommand | null;
  width: CompactCommand | null;
}

const BRUSH_GROUP_ORDER: FloatingToolbarGroupKind[] = [
  'templates',
  'geometry',
  'stroke',
  'effects',
  'more',
];

function resolveBrushTool(commands: CompactCommand[]): BrushToolbarTool | null {
  const hasPencil = commands.some((command) => command.id.startsWith('pencil-'));
  const hasHighlighter = commands.some((command) => command.id.startsWith('highlighter-'));

  if (hasPencil && !hasHighlighter) {
    return 'pencil';
  }
  if (hasHighlighter && !hasPencil) {
    return 'highlighter';
  }

  return null;
}

function createBrushColorTrigger(command: CompactCommand | null) {
  return (
    <TablerColorIcon
      color={command?.value ?? 'currentColor'}
      icon="tabler:palette"
      opacity={command ? 1 : 0.72}
    />
  );
}

function createBrushShadowTrigger(command: CompactCommand | null) {
  return command?.trigger ?? <TablerIcon icon="tabler:shadow-off" opacity={0.65} />;
}

function createBrushTemplateTrigger(command: CompactCommand | null) {
  return command?.trigger ?? <TablerIcon icon="tabler:template" />;
}

function collectBrushCommands(
  commands: CompactCommand[],
  tool: BrushToolbarTool
): BrushToolbarCommands {
  return {
    color: getToolbarCommand(commands, `${tool}-color`),
    dynamicWidth: tool === 'pencil' ? getToolbarCommand(commands, 'pencil-dynamic-width') : null,
    opacity: getToolbarCommand(commands, `${tool}-opacity`),
    shadow: tool === 'pencil' ? getToolbarCommand(commands, 'pencil-shadow') : null,
    smoothing: getToolbarCommand(commands, `${tool}-smoothing`),
    template: getToolbarCommand(commands, `${tool}-template`),
    width: getToolbarCommand(commands, `${tool}-width`),
  };
}

export function isBrushToolbarCommandSet(commands: CompactCommand[]): boolean {
  return resolveBrushTool(commands) !== null;
}

export function sortBrushToolbarGroups(groups: FloatingToolbarGroup[]): FloatingToolbarGroup[] {
  return groups.sort(
    (left, right) => BRUSH_GROUP_ORDER.indexOf(left.kind) - BRUSH_GROUP_ORDER.indexOf(right.kind)
  );
}

function createBrushBaseGroups(
  brushCommands: BrushToolbarCommands
): Array<FloatingToolbarGroup | null> {
  return [
    createToolbarGroup({
      id: 'templates',
      kind: 'templates',
      title: CANVAS_TOOLBAR_GROUP_TITLES.templates,
      commands: brushCommands.template ? [brushCommands.template] : [],
      trigger: createBrushTemplateTrigger(brushCommands.template),
      width: 'style',
    }),
    createToolbarGroup({
      id: 'geometry',
      kind: 'geometry',
      title: CANVAS_TOOLBAR_GROUP_TITLES.geometry,
      commands: [brushCommands.width, brushCommands.dynamicWidth, brushCommands.smoothing].filter(
        isToolbarCommand
      ),
      trigger: brushCommands.width?.trigger ?? null,
      width: 'style',
    }),
    createToolbarGroup({
      id: 'line-color',
      kind: 'stroke',
      title: translate('editor.compact.lineColor'),
      commands: [brushCommands.color, brushCommands.opacity].filter(isToolbarCommand),
      trigger: createBrushColorTrigger(brushCommands.color),
      width: 'style',
    }),
    createToolbarGroup({
      id: 'shadow',
      kind: 'effects',
      title: translate('highlighter.editor.shadowLabel'),
      commands: brushCommands.shadow ? [brushCommands.shadow] : [],
      trigger: createBrushShadowTrigger(brushCommands.shadow),
      width: 'rich',
    }),
  ];
}

export function createBrushToolbarGroups(
  commands: CompactCommand[]
): FloatingToolbarGroup[] | null {
  const tool = resolveBrushTool(commands);
  if (!tool) {
    return null;
  }

  const brushCommands = collectBrushCommands(commands, tool);
  const groups = createBrushBaseGroups(brushCommands);

  return sortBrushToolbarGroups(
    groups.filter((group): group is FloatingToolbarGroup => group !== null)
  );
}
