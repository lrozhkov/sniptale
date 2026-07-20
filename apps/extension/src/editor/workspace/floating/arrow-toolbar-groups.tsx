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

const ARROW_GROUP_ORDER = [
  'templates',
  'geometry',
  'line-color',
  'style',
  'heads',
  'shadow',
  'more',
] as const;

type ArrowGroupId = (typeof ARROW_GROUP_ORDER)[number];

interface ArrowToolbarCommands {
  bowing: CompactCommand | null;
  color: CompactCommand | null;
  dynamicWidth: CompactCommand | null;
  endHead: CompactCommand | null;
  roughness: CompactCommand | null;
  shadow: CompactCommand | null;
  startHead: CompactCommand | null;
  style: CompactCommand | null;
  template: CompactCommand | null;
  type: CompactCommand | null;
  width: CompactCommand | null;
}

function collectArrowCommands(commands: CompactCommand[]): ArrowToolbarCommands {
  return {
    bowing: getToolbarCommand(commands, 'arrow-bowing'),
    color: getToolbarCommand(commands, 'arrow-color'),
    dynamicWidth: getToolbarCommand(commands, 'arrow-dynamic-width'),
    endHead: getToolbarCommand(commands, 'arrow-end-head'),
    roughness: getToolbarCommand(commands, 'arrow-roughness'),
    shadow: getToolbarCommand(commands, 'arrow-shadow'),
    startHead: getToolbarCommand(commands, 'arrow-start-head'),
    style: getToolbarCommand(commands, 'arrow-style'),
    template: getToolbarCommand(commands, 'arrow-template'),
    type: getToolbarCommand(commands, 'arrow-type'),
    width: getToolbarCommand(commands, 'arrow-width'),
  };
}

type ArrowGroupSpec = ToolbarGroupSpec<ArrowGroupId>;

function createArrowPrimaryGroupSpecs(arrowCommands: ArrowToolbarCommands): ArrowGroupSpec[] {
  return [
    {
      id: 'templates',
      kind: 'templates',
      title: CANVAS_TOOLBAR_GROUP_TITLES.templates,
      commands: arrowCommands.template ? [arrowCommands.template] : [],
      trigger: arrowCommands.template?.trigger ?? <TablerIcon icon="tabler:template" />,
      width: 'style',
    },
    {
      id: 'geometry',
      kind: 'geometry',
      title: CANVAS_TOOLBAR_GROUP_TITLES.geometry,
      commands: [
        arrowCommands.width,
        arrowCommands.type,
        arrowCommands.dynamicWidth,
        arrowCommands.roughness,
        arrowCommands.bowing,
      ].filter(isToolbarCommand),
      trigger: arrowCommands.width?.trigger ?? <TablerIcon icon="tabler:arrow-up-right" />,
      width: 'style',
    },
    {
      id: 'line-color',
      kind: 'stroke',
      title: translate('editor.compact.arrowColor'),
      commands: arrowCommands.color ? [arrowCommands.color] : [],
      trigger: (
        <TablerColorIcon
          color={arrowCommands.color?.value ?? 'currentColor'}
          icon="tabler:palette"
        />
      ),
      width: 'style',
    },
  ];
}

function createArrowSecondaryGroupSpecs(arrowCommands: ArrowToolbarCommands): ArrowGroupSpec[] {
  return [
    {
      id: 'style',
      kind: 'stroke',
      title: translate('editor.compact.lineStyle'),
      commands: arrowCommands.style ? [arrowCommands.style] : [],
      trigger: arrowCommands.style?.trigger ?? <TablerIcon icon="tabler:line-dashed" />,
      width: 'simple',
    },
    {
      id: 'heads',
      kind: 'geometry',
      title: translate('editor.compact.arrowHeads'),
      commands: [arrowCommands.startHead, arrowCommands.endHead].filter(isToolbarCommand),
      trigger: <TablerIcon icon="tabler:route" />,
      width: 'style',
    },
    {
      id: 'shadow',
      kind: 'effects',
      title: translate('highlighter.editor.shadowLabel'),
      commands: arrowCommands.shadow ? [arrowCommands.shadow] : [],
      trigger: arrowCommands.shadow?.trigger ?? (
        <TablerIcon icon="tabler:shadow-off" opacity={0.65} />
      ),
      width: 'rich',
    },
  ];
}

function createArrowGroupSpecs(arrowCommands: ArrowToolbarCommands): ArrowGroupSpec[] {
  return [
    ...createArrowPrimaryGroupSpecs(arrowCommands),
    ...createArrowSecondaryGroupSpecs(arrowCommands),
  ];
}

export function isArrowToolbarCommandSet(commands: CompactCommand[]): boolean {
  return commands.some((command) => command.id.startsWith('arrow-'));
}

export function sortArrowToolbarGroups(groups: FloatingToolbarGroup[]): FloatingToolbarGroup[] {
  return groups.sort(
    (left, right) =>
      ARROW_GROUP_ORDER.indexOf(left.id as ArrowGroupId) -
      ARROW_GROUP_ORDER.indexOf(right.id as ArrowGroupId)
  );
}

export function createArrowToolbarGroups(
  commands: CompactCommand[]
): FloatingToolbarGroup[] | null {
  if (!isArrowToolbarCommandSet(commands)) {
    return null;
  }

  const groups = createArrowGroupSpecs(collectArrowCommands(commands)).map(createToolbarGroup);
  return sortArrowToolbarGroups(
    groups.filter((group): group is FloatingToolbarGroup => group !== null)
  );
}
