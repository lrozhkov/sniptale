import { translate } from '../../../platform/i18n';
import type { CompactCommand } from '../../inspector/compact';
import { TablerColorIcon, TypeOutlineColorIcon } from '../../inspector/compact/color-icon';
import { TablerIcon } from '../../inspector/compact/tabler-icon';
import { CANVAS_TOOLBAR_GROUP_TITLES, type FloatingToolbarGroup } from './canvas-toolbar-model';
import {
  createToolbarGroup,
  getToolbarCommand,
  isToolbarCommand,
  parseToolbarPercent,
  type ToolbarGroupSpec,
} from './toolbar-group-builders';

const STEP_GROUP_ORDER = [
  'templates',
  'content',
  'text-color',
  'fill',
  'stroke',
  'geometry',
  'more',
] as const;
type StepGroupId = (typeof STEP_GROUP_ORDER)[number];

interface StepToolbarCommands {
  alphabet: CompactCommand | null;
  color: CompactCommand | null;
  opacity: CompactCommand | null;
  size: CompactCommand | null;
  strokeColor: CompactCommand | null;
  strokeOpacity: CompactCommand | null;
  strokeWidth: CompactCommand | null;
  template: CompactCommand | null;
  textColor: CompactCommand | null;
  type: CompactCommand | null;
  value: CompactCommand | null;
}

function collectStepCommands(commands: CompactCommand[]): StepToolbarCommands {
  return {
    alphabet: getToolbarCommand(commands, 'step-alphabet'),
    color: getToolbarCommand(commands, 'step-color'),
    opacity: getToolbarCommand(commands, 'step-opacity'),
    size: getToolbarCommand(commands, 'step-size'),
    strokeColor: getToolbarCommand(commands, 'step-stroke-color'),
    strokeOpacity: getToolbarCommand(commands, 'step-stroke-opacity'),
    strokeWidth: getToolbarCommand(commands, 'step-stroke-width'),
    template: getToolbarCommand(commands, 'step-template'),
    textColor: getToolbarCommand(commands, 'step-text-color'),
    type: getToolbarCommand(commands, 'step-type'),
    value: getToolbarCommand(commands, 'step-value'),
  };
}

function parseOpacity(command: CompactCommand | null) {
  return parseToolbarPercent(command?.value);
}

function createStepColorTrigger(args: {
  color: CompactCommand | null;
  icon: 'tabler:bucket' | 'tabler:bucket-off' | 'tabler:palette' | 'type-outline';
  opacity?: CompactCommand | null;
}) {
  const opacity = args.opacity ? parseOpacity(args.opacity) : undefined;

  if (args.icon === 'type-outline') {
    return (
      <TypeOutlineColorIcon
        color={args.color?.value ?? 'currentColor'}
        {...(opacity === undefined ? {} : { opacity })}
      />
    );
  }

  return (
    <TablerColorIcon
      color={args.color?.value ?? 'currentColor'}
      icon={args.icon}
      {...(opacity === undefined ? {} : { opacity })}
    />
  );
}

type StepGroupSpec = ToolbarGroupSpec<StepGroupId>;

function createStepPrimaryGroupSpecs(stepCommands: StepToolbarCommands): StepGroupSpec[] {
  return [
    {
      id: 'templates',
      kind: 'templates',
      title: CANVAS_TOOLBAR_GROUP_TITLES.templates,
      commands: stepCommands.template ? [stepCommands.template] : [],
      trigger: stepCommands.template?.trigger ?? <TablerIcon icon="tabler:template" />,
      width: 'style',
    },
    {
      id: 'content',
      kind: 'content',
      title: CANVAS_TOOLBAR_GROUP_TITLES.content,
      commands: [stepCommands.type, stepCommands.value, stepCommands.alphabet].filter(
        isToolbarCommand
      ),
      trigger: <TablerIcon icon="tabler:square-number-1" />,
      width: 'style',
    },
    {
      id: 'text-color',
      kind: 'stroke',
      title: translate('editor.compact.stepTextColor'),
      commands: stepCommands.textColor ? [stepCommands.textColor] : [],
      trigger: createStepColorTrigger({ color: stepCommands.textColor, icon: 'type-outline' }),
      width: 'style',
    },
    {
      id: 'fill',
      kind: 'fill',
      title: translate('editor.compact.stepShapeColor'),
      commands: [stepCommands.color, stepCommands.opacity].filter(isToolbarCommand),
      trigger: createStepColorTrigger({
        color: stepCommands.color,
        icon: parseOpacity(stepCommands.opacity) <= 0 ? 'tabler:bucket-off' : 'tabler:bucket',
        opacity: stepCommands.opacity,
      }),
      width: 'style',
    },
  ];
}

function createStepSecondaryGroupSpecs(stepCommands: StepToolbarCommands): StepGroupSpec[] {
  return [
    {
      id: 'stroke',
      kind: 'stroke',
      title: translate('editor.compact.stepStrokeColor'),
      commands: [
        stepCommands.strokeWidth,
        stepCommands.strokeColor,
        stepCommands.strokeOpacity,
      ].filter(isToolbarCommand),
      trigger: createStepColorTrigger({
        color: stepCommands.strokeColor,
        icon: 'tabler:palette',
        opacity: stepCommands.strokeOpacity,
      }),
      width: 'style',
    },
    {
      id: 'geometry',
      kind: 'geometry',
      title: CANVAS_TOOLBAR_GROUP_TITLES.geometry,
      commands: stepCommands.size ? [stepCommands.size] : [],
      trigger: stepCommands.size?.trigger ?? <TablerIcon icon="tabler:arrows-right-left" />,
      width: 'simple',
    },
  ];
}

function createStepGroupSpecs(stepCommands: StepToolbarCommands): StepGroupSpec[] {
  return [
    ...createStepPrimaryGroupSpecs(stepCommands),
    ...createStepSecondaryGroupSpecs(stepCommands),
  ];
}

export function isStepToolbarCommandSet(commands: CompactCommand[]): boolean {
  return commands.some((command) => command.id.startsWith('step-'));
}

export function sortStepToolbarGroups(groups: FloatingToolbarGroup[]): FloatingToolbarGroup[] {
  return groups.sort(
    (left, right) =>
      STEP_GROUP_ORDER.indexOf(left.id as StepGroupId) -
      STEP_GROUP_ORDER.indexOf(right.id as StepGroupId)
  );
}

export function createStepToolbarGroups(commands: CompactCommand[]): FloatingToolbarGroup[] | null {
  if (!isStepToolbarCommandSet(commands)) {
    return null;
  }

  const groups = createStepGroupSpecs(collectStepCommands(commands)).map(createToolbarGroup);
  return sortStepToolbarGroups(
    groups.filter((group): group is FloatingToolbarGroup => group !== null)
  );
}
