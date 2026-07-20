import { translate } from '../../../platform/i18n';
import type { CompactCommand } from '../../inspector/compact';
import { TablerColorIcon } from '../../inspector/compact/color-icon';
import { TablerIcon } from '../../inspector/compact/tabler-icon';
import { CANVAS_TOOLBAR_GROUP_TITLES, type FloatingToolbarGroup } from './canvas-toolbar-model';
import {
  createToolbarGroup,
  getToolbarCommand,
  isToolbarCommand,
  parseToolbarPercent,
  type ToolbarGroupSpec,
} from './toolbar-group-builders';

const LINE_GROUP_ORDER = [
  'templates',
  'geometry',
  'line-color',
  'style',
  'corners',
  'fill',
  'shadow',
  'more',
] as const;

type LineGroupId = (typeof LINE_GROUP_ORDER)[number];

interface LineToolbarCommands {
  bowing: CompactCommand | null;
  color: CompactCommand | null;
  corners: CompactCommand | null;
  fill: CompactCommand | null;
  opacity: CompactCommand | null;
  roughness: CompactCommand | null;
  shadow: CompactCommand | null;
  style: CompactCommand | null;
  template: CompactCommand | null;
  width: CompactCommand | null;
}

function parseOpacity(command: CompactCommand | null) {
  return parseToolbarPercent(command?.value);
}

function collectLineCommands(commands: CompactCommand[]): LineToolbarCommands {
  return {
    bowing: getToolbarCommand(commands, 'line-bowing'),
    color: getToolbarCommand(commands, 'line-color'),
    corners: getToolbarCommand(commands, 'line-corners'),
    fill: getToolbarCommand(commands, 'line-fill'),
    opacity: getToolbarCommand(commands, 'line-opacity'),
    roughness: getToolbarCommand(commands, 'line-roughness'),
    shadow: getToolbarCommand(commands, 'line-shadow'),
    style: getToolbarCommand(commands, 'line-style'),
    template: getToolbarCommand(commands, 'line-template'),
    width: getToolbarCommand(commands, 'line-width'),
  };
}

function createLineColorTrigger(lineCommands: LineToolbarCommands) {
  return (
    <TablerColorIcon
      color={lineCommands.color?.value ?? 'currentColor'}
      icon="tabler:palette"
      opacity={parseOpacity(lineCommands.opacity)}
    />
  );
}

function createLineFillTrigger(lineCommands: LineToolbarCommands) {
  return lineCommands.fill?.trigger ?? <TablerIcon icon="tabler:bucket-off" />;
}

type LineGroupSpec = ToolbarGroupSpec<LineGroupId>;

function createLinePrimaryGroupSpecs(lineCommands: LineToolbarCommands): LineGroupSpec[] {
  return [
    {
      id: 'templates',
      kind: 'templates',
      title: CANVAS_TOOLBAR_GROUP_TITLES.templates,
      commands: lineCommands.template ? [lineCommands.template] : [],
      trigger: lineCommands.template?.trigger ?? <TablerIcon icon="tabler:template" />,
      width: 'style',
    },
    {
      id: 'geometry',
      kind: 'geometry',
      title: CANVAS_TOOLBAR_GROUP_TITLES.geometry,
      commands: [lineCommands.width, lineCommands.roughness, lineCommands.bowing].filter(
        isToolbarCommand
      ),
      trigger: lineCommands.width?.trigger ?? null,
      width: 'style',
    },
    {
      id: 'line-color',
      kind: 'stroke',
      title: translate('editor.compact.lineColor'),
      commands: [lineCommands.color, lineCommands.opacity].filter(isToolbarCommand),
      trigger: createLineColorTrigger(lineCommands),
      width: 'style',
    },
  ];
}

function createLineSecondaryGroupSpecs(lineCommands: LineToolbarCommands): LineGroupSpec[] {
  return [
    {
      id: 'style',
      kind: 'stroke',
      title: translate('editor.compact.lineStyle'),
      commands: lineCommands.style ? [lineCommands.style] : [],
      trigger: lineCommands.style?.trigger ?? <TablerIcon icon="tabler:line-dashed" />,
      width: 'simple',
    },
    {
      id: 'corners',
      kind: 'geometry',
      title: translate('editor.compact.lineCorners'),
      commands: lineCommands.corners ? [lineCommands.corners] : [],
      trigger: lineCommands.corners?.trigger ?? <TablerIcon icon="tabler:border-corner-square" />,
      width: 'simple',
    },
    {
      id: 'fill',
      kind: 'fill',
      title: translate('editor.compact.lineFill'),
      commands: lineCommands.fill ? [lineCommands.fill] : [],
      trigger: createLineFillTrigger(lineCommands),
      width: 'rich',
    },
    {
      id: 'shadow',
      kind: 'effects',
      title: translate('highlighter.editor.shadowLabel'),
      commands: lineCommands.shadow ? [lineCommands.shadow] : [],
      trigger: lineCommands.shadow?.trigger ?? (
        <TablerIcon icon="tabler:shadow-off" opacity={0.65} />
      ),
      width: 'rich',
    },
  ];
}

function createLineToolbarGroupSpecs(lineCommands: LineToolbarCommands): LineGroupSpec[] {
  return [
    ...createLinePrimaryGroupSpecs(lineCommands),
    ...createLineSecondaryGroupSpecs(lineCommands),
  ];
}

export function isLineToolbarCommandSet(commands: CompactCommand[]): boolean {
  return commands.some((command) => command.id.startsWith('line-'));
}

export function sortLineToolbarGroups(groups: FloatingToolbarGroup[]): FloatingToolbarGroup[] {
  return groups.sort(
    (left, right) =>
      LINE_GROUP_ORDER.indexOf(left.id as LineGroupId) -
      LINE_GROUP_ORDER.indexOf(right.id as LineGroupId)
  );
}

export function createLineToolbarGroups(commands: CompactCommand[]): FloatingToolbarGroup[] | null {
  if (!isLineToolbarCommandSet(commands)) {
    return null;
  }

  const lineCommands = collectLineCommands(commands);
  const groups = createLineToolbarGroupSpecs(lineCommands).map(createToolbarGroup);

  return sortLineToolbarGroups(
    groups.filter((group): group is FloatingToolbarGroup => group !== null)
  );
}
