import { translate } from '../../../platform/i18n';
import type { CompactCommand } from '../../inspector/compact';
import { TablerBorderIcon } from '../../inspector/compact/tabler-border-icon';
import { TablerIcon } from '../../inspector/compact/tabler-icon';
import { CANVAS_TOOLBAR_GROUP_TITLES, type FloatingToolbarGroup } from './canvas-toolbar-model';
import {
  createToolbarGroup,
  getToolbarCommand,
  isToolbarCommand,
  parseToolbarPercent,
  parseToolbarPixel,
} from './toolbar-group-builders';

const BLUR_GROUP_ORDER = ['templates', 'effect', 'border', 'more'] as const;
type BlurGroupId = (typeof BLUR_GROUP_ORDER)[number];

interface BlurToolbarCommands {
  amount: CompactCommand | null;
  radius: CompactCommand | null;
  strokeColor: CompactCommand | null;
  strokeOpacity: CompactCommand | null;
  strokeStyle: CompactCommand | null;
  strokeWidth: CompactCommand | null;
  template: CompactCommand | null;
  type: CompactCommand | null;
}

function collectBlurCommands(commands: CompactCommand[]): BlurToolbarCommands {
  return {
    amount: getToolbarCommand(commands, 'blur-amount'),
    radius: getToolbarCommand(commands, 'blur-radius'),
    strokeColor: getToolbarCommand(commands, 'blur-stroke-color'),
    strokeOpacity: getToolbarCommand(commands, 'blur-stroke-opacity'),
    strokeStyle: getToolbarCommand(commands, 'blur-stroke-style'),
    strokeWidth: getToolbarCommand(commands, 'blur-stroke-width'),
    template: getToolbarCommand(commands, 'blur-template'),
    type: getToolbarCommand(commands, 'blur-type'),
  };
}

function normalizeStrokeStyle(value: string | undefined) {
  const normalized = value?.toLowerCase() ?? '';
  if (normalized.includes('dash dot') || normalized.includes('штрих')) {
    return 'dash-dot';
  }
  if (normalized.includes('long') || normalized.includes('длин')) {
    return 'long-dash';
  }
  if (normalized.includes('dot') || normalized.includes('точ')) {
    return 'dot';
  }
  if (normalized.includes('dash') || normalized.includes('пунктир')) {
    return 'dash';
  }

  return 'solid';
}

function createBorderTrigger(commands: BlurToolbarCommands) {
  const optionalProps = {
    ...(commands.strokeColor?.value === undefined ? {} : { color: commands.strokeColor.value }),
  };

  return (
    <TablerBorderIcon
      opacity={parseToolbarPercent(commands.strokeOpacity?.value)}
      strokeStyle={normalizeStrokeStyle(commands.strokeStyle?.value)}
      strokeWidth={parseToolbarPixel(commands.strokeWidth?.value)}
      {...optionalProps}
    />
  );
}

export function isBlurToolbarCommandSet(commands: CompactCommand[]): boolean {
  return commands.some((command) => command.id.startsWith('blur-'));
}

export function sortBlurToolbarGroups(groups: FloatingToolbarGroup[]): FloatingToolbarGroup[] {
  return groups.sort(
    (left, right) =>
      BLUR_GROUP_ORDER.indexOf(left.id as BlurGroupId) -
      BLUR_GROUP_ORDER.indexOf(right.id as BlurGroupId)
  );
}

export function createBlurToolbarGroups(commands: CompactCommand[]): FloatingToolbarGroup[] | null {
  if (!isBlurToolbarCommandSet(commands)) {
    return null;
  }

  const blurCommands = collectBlurCommands(commands);
  const groups = [
    createToolbarGroup<BlurGroupId>({
      id: 'templates',
      kind: 'templates',
      title: CANVAS_TOOLBAR_GROUP_TITLES.templates,
      commands: blurCommands.template ? [blurCommands.template] : [],
      trigger: blurCommands.template?.trigger ?? <TablerIcon icon="tabler:template" />,
      width: 'style',
    }),
    createToolbarGroup<BlurGroupId>({
      id: 'effect',
      kind: 'content',
      title: translate('editor.compact.blurEffectSettings'),
      commands: [blurCommands.type, blurCommands.amount, blurCommands.radius].filter(
        isToolbarCommand
      ),
      trigger: <TablerIcon icon="tabler:blur" />,
      width: 'style',
    }),
    createToolbarGroup<BlurGroupId>({
      id: 'border',
      kind: 'stroke',
      title: translate('editor.compact.blurBorder'),
      commands: [
        blurCommands.strokeWidth,
        blurCommands.strokeStyle,
        blurCommands.strokeColor,
        blurCommands.strokeOpacity,
      ].filter(isToolbarCommand),
      trigger: createBorderTrigger(blurCommands),
      width: 'style',
    }),
  ];

  return sortBlurToolbarGroups(
    groups.filter((group): group is FloatingToolbarGroup => group !== null)
  );
}
