import { translate } from '../../../platform/i18n';
import type { CompactCommand } from '../../inspector/compact';
import { TablerColorIcon } from '../../inspector/compact/color-icon';
import { TablerIcon } from '../../inspector/compact/tabler-icon';
import { CANVAS_TOOLBAR_GROUP_TITLES, type FloatingToolbarGroup } from './canvas-toolbar-model';
import {
  createToolbarGroup,
  getToolbarCommand,
  isToolbarCommand,
  type ToolbarGroupSpec,
} from './toolbar-group-builders';

const SHAPE_GROUP_ORDER = ['templates', 'fill', 'stroke', 'geometry', 'shadow', 'more'] as const;
type ShapeGroupId = (typeof SHAPE_GROUP_ORDER)[number];

interface ShapeToolbarCommands {
  fillColor: CompactCommand | null;
  fillOpacity: CompactCommand | null;
  preset: CompactCommand | null;
  radius: CompactCommand | null;
  shadow: CompactCommand | null;
  strokeColor: CompactCommand | null;
  strokeOpacity: CompactCommand | null;
  strokeStyle: CompactCommand | null;
  strokeWidth: CompactCommand | null;
}

function collectShapeCommands(commands: CompactCommand[]): ShapeToolbarCommands {
  return {
    fillColor: getToolbarCommand(commands, 'shape-fill-color'),
    fillOpacity: getToolbarCommand(commands, 'shape-fill-opacity'),
    preset:
      getToolbarCommand(commands, 'shape-preset') ??
      commands.find((command) => command.id.endsWith('-template')) ??
      null,
    radius: getToolbarCommand(commands, 'shape-radius'),
    shadow: getToolbarCommand(commands, 'shape-shadow'),
    strokeColor: getToolbarCommand(commands, 'shape-stroke-color'),
    strokeOpacity: getToolbarCommand(commands, 'shape-stroke-opacity'),
    strokeStyle: getToolbarCommand(commands, 'shape-stroke-style'),
    strokeWidth: getToolbarCommand(commands, 'shape-stroke-width'),
  };
}

function parseOpacity(command: CompactCommand | null) {
  return command?.value?.endsWith('%') ? Number.parseInt(command.value, 10) / 100 : 1;
}

function resolveVisibleIconOpacity(opacity: number) {
  return opacity <= 0 ? 0.65 : opacity;
}

type ShapeGroupSpec = ToolbarGroupSpec<ShapeGroupId>;

function createShapePrimaryGroupSpecs(shapeCommands: ShapeToolbarCommands): ShapeGroupSpec[] {
  return [
    {
      id: 'templates',
      kind: 'templates',
      title: CANVAS_TOOLBAR_GROUP_TITLES.templates,
      commands: shapeCommands.preset ? [shapeCommands.preset] : [],
      trigger: shapeCommands.preset?.trigger ?? <TablerIcon icon="tabler:template" />,
      width: 'style',
    },
    {
      id: 'fill',
      kind: 'fill',
      title: CANVAS_TOOLBAR_GROUP_TITLES.fill,
      commands: [shapeCommands.fillColor, shapeCommands.fillOpacity].filter(isToolbarCommand),
      trigger: (
        <TablerColorIcon
          color={shapeCommands.fillColor?.value ?? 'currentColor'}
          icon={
            parseOpacity(shapeCommands.fillOpacity) <= 0 ? 'tabler:bucket-off' : 'tabler:bucket'
          }
          opacity={resolveVisibleIconOpacity(parseOpacity(shapeCommands.fillOpacity))}
        />
      ),
      width: 'style',
    },
    {
      id: 'stroke',
      kind: 'stroke',
      title: CANVAS_TOOLBAR_GROUP_TITLES.stroke,
      commands: [
        shapeCommands.strokeColor,
        shapeCommands.strokeWidth,
        shapeCommands.strokeStyle,
        shapeCommands.strokeOpacity,
      ].filter(isToolbarCommand),
      trigger: (
        <TablerColorIcon
          color={shapeCommands.strokeColor?.value ?? 'currentColor'}
          icon="tabler:palette"
          opacity={parseOpacity(shapeCommands.strokeOpacity)}
        />
      ),
      width: 'style',
    },
  ];
}

function createShapeSecondaryGroupSpecs(shapeCommands: ShapeToolbarCommands): ShapeGroupSpec[] {
  return [
    {
      id: 'geometry',
      kind: 'geometry',
      title: CANVAS_TOOLBAR_GROUP_TITLES.geometry,
      commands: shapeCommands.radius ? [shapeCommands.radius] : [],
      trigger: <TablerIcon icon="tabler:border-radius" />,
      width: 'simple',
    },
    {
      id: 'shadow',
      kind: 'effects',
      title: translate('highlighter.editor.shadowLabel'),
      commands: shapeCommands.shadow ? [shapeCommands.shadow] : [],
      trigger: shapeCommands.shadow?.trigger ?? (
        <TablerIcon icon="tabler:shadow-off" opacity={0.65} />
      ),
      width: 'rich',
    },
  ];
}

function createShapeGroupSpecs(shapeCommands: ShapeToolbarCommands): ShapeGroupSpec[] {
  return [
    ...createShapePrimaryGroupSpecs(shapeCommands),
    ...createShapeSecondaryGroupSpecs(shapeCommands),
  ];
}

export function isShapeToolbarCommandSet(commands: CompactCommand[]): boolean {
  return commands.some((command) => command.id.startsWith('shape-'));
}

export function sortShapeToolbarGroups(groups: FloatingToolbarGroup[]): FloatingToolbarGroup[] {
  return groups.sort(
    (left, right) =>
      SHAPE_GROUP_ORDER.indexOf(left.id as ShapeGroupId) -
      SHAPE_GROUP_ORDER.indexOf(right.id as ShapeGroupId)
  );
}

export function createShapeToolbarGroups(
  commands: CompactCommand[]
): FloatingToolbarGroup[] | null {
  if (!isShapeToolbarCommandSet(commands)) {
    return null;
  }

  const groups = createShapeGroupSpecs(collectShapeCommands(commands)).map(createToolbarGroup);
  return sortShapeToolbarGroups(
    groups.filter((group): group is FloatingToolbarGroup => group !== null)
  );
}
