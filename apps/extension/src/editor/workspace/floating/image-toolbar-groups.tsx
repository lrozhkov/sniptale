import { translate } from '../../../platform/i18n';
import type { CompactCommand } from '../../inspector/compact';
import { TablerBorderIcon } from '../../inspector/compact/tabler-border-icon';
import { TablerIcon } from '../../inspector/compact/tabler-icon';
import type { FloatingToolbarGroup } from './canvas-toolbar-model';
import {
  createToolbarGroup,
  getToolbarCommand,
  isToolbarCommand,
  parseToolbarPercent,
  parseToolbarPixel,
  type ToolbarGroupSpec,
} from './toolbar-group-builders';

const IMAGE_GROUP_ORDER = ['opacity', 'geometry', 'shadow', 'border', 'more'] as const;
type ImageGroupId = (typeof IMAGE_GROUP_ORDER)[number];

interface ImageToolbarCommands {
  opacity: CompactCommand | null;
  radius: CompactCommand | null;
  shadow: CompactCommand | null;
  strokeColor: CompactCommand | null;
  strokeOpacity: CompactCommand | null;
  strokeStyle: CompactCommand | null;
  strokeWidth: CompactCommand | null;
}

type ImageGroupSpec = ToolbarGroupSpec<ImageGroupId>;

function collectImageCommands(commands: CompactCommand[]): ImageToolbarCommands {
  return {
    opacity: getToolbarCommand(commands, 'image-opacity'),
    radius: getToolbarCommand(commands, 'image-radius'),
    shadow: getToolbarCommand(commands, 'image-shadow'),
    strokeColor: getToolbarCommand(commands, 'image-stroke-color'),
    strokeOpacity: getToolbarCommand(commands, 'image-stroke-opacity'),
    strokeStyle: getToolbarCommand(commands, 'image-stroke-style'),
    strokeWidth: getToolbarCommand(commands, 'image-stroke-width'),
  };
}

function createBorderTrigger(commands: ImageToolbarCommands) {
  const strokeStyle =
    commands.strokeStyle?.value === 'dotted'
      ? 'dot'
      : commands.strokeStyle?.value === 'dashed'
        ? 'dash'
        : commands.strokeStyle?.value;

  const optionalStyle = strokeStyle === undefined ? {} : { strokeStyle };

  return (
    <TablerBorderIcon
      color={commands.strokeColor?.value ?? 'currentColor'}
      opacity={parseToolbarPercent(commands.strokeOpacity?.value)}
      strokeWidth={parseToolbarPixel(commands.strokeWidth?.value)}
      {...optionalStyle}
    />
  );
}

export function isImageToolbarCommandSet(commands: CompactCommand[]): boolean {
  return commands.some((command) => command.id.startsWith('image-'));
}

export function sortImageToolbarGroups(groups: FloatingToolbarGroup[]): FloatingToolbarGroup[] {
  return groups.sort(
    (left, right) =>
      IMAGE_GROUP_ORDER.indexOf(left.id as ImageGroupId) -
      IMAGE_GROUP_ORDER.indexOf(right.id as ImageGroupId)
  );
}

function createImageGroupSpecs(imageCommands: ImageToolbarCommands): ImageGroupSpec[] {
  return [
    createImageOpacityGroupSpec(imageCommands),
    createImageGeometryGroupSpec(imageCommands),
    createImageShadowGroupSpec(imageCommands),
    createImageBorderGroupSpec(imageCommands),
  ];
}

function createImageOpacityGroupSpec(imageCommands: ImageToolbarCommands): ImageGroupSpec {
  return {
    id: 'opacity',
    kind: 'content',
    title: translate('editor.compact.opacity'),
    commands: imageCommands.opacity ? [imageCommands.opacity] : [],
    hideValue: false,
    trigger: imageCommands.opacity?.trigger ?? <TablerIcon icon="tabler:layers-intersect-2" />,
    width: 'simple',
  };
}

function createImageGeometryGroupSpec(imageCommands: ImageToolbarCommands): ImageGroupSpec {
  return {
    id: 'geometry',
    kind: 'geometry',
    title: translate('editor.compact.cornerRadius'),
    commands: imageCommands.radius ? [imageCommands.radius] : [],
    hideValue: false,
    trigger: imageCommands.radius?.trigger ?? <TablerIcon icon="tabler:border-corner-square" />,
    width: 'simple',
  };
}

function createImageShadowGroupSpec(imageCommands: ImageToolbarCommands): ImageGroupSpec {
  return {
    id: 'shadow',
    kind: 'effects',
    title: translate('highlighter.editor.shadowLabel'),
    commands: imageCommands.shadow ? [imageCommands.shadow] : [],
    hideValue: false,
    trigger: imageCommands.shadow?.trigger ?? <TablerIcon icon="tabler:shadow-off" />,
    width: 'rich',
  };
}

function createImageBorderGroupSpec(imageCommands: ImageToolbarCommands): ImageGroupSpec {
  return {
    id: 'border',
    kind: 'stroke',
    title: translate('editor.compact.blurBorder'),
    commands: [
      imageCommands.strokeWidth,
      imageCommands.strokeStyle,
      imageCommands.strokeColor,
      imageCommands.strokeOpacity,
    ].filter(isToolbarCommand),
    hideValue: false,
    trigger: createBorderTrigger(imageCommands),
    width: 'style',
  };
}

export function createImageToolbarGroups(
  commands: CompactCommand[]
): FloatingToolbarGroup[] | null {
  if (!isImageToolbarCommandSet(commands)) {
    return null;
  }

  const imageCommands = collectImageCommands(commands);
  const groups = createImageGroupSpecs(imageCommands).map(createToolbarGroup);

  return sortImageToolbarGroups(
    groups.filter((group): group is FloatingToolbarGroup => group !== null)
  );
}
