import type React from 'react';
import { translate } from '../../../platform/i18n';
import { ToggleGrid } from '../../chrome/ui';
import type { CompactCommand } from '../../inspector/compact';
import { TablerColorIcon, TypeOutlineColorIcon } from '../../inspector/compact/color-icon';
import { TablerIcon } from '../../inspector/compact/tabler-icon';
import { renderFloatingToolbarCommandBody } from './canvas-toolbar-command-groups';
import {
  CANVAS_TOOLBAR_GROUP_TITLES,
  CANVAS_TOOLBAR_GROUP_WIDTHS,
  type FloatingToolbarGroup,
} from './canvas-toolbar-model';
import {
  getToolbarCommand,
  isToolbarCommand,
  parseToolbarPercent,
  renderToolbarGroupContent,
} from './toolbar-group-builders';

const TEXT_TOOLBAR_GROUP_ORDER = [
  'templates',
  'font',
  'font-size',
  'text-color',
  'fill',
  'geometry',
  'shadow',
  'more',
] as const;
type TextToolbarGroupId = (typeof TEXT_TOOLBAR_GROUP_ORDER)[number];
type TextToolbarFontTriggerMode = 'icon' | 'label';

interface TextToolbarCommands {
  align: CompactCommand | null;
  background: CompactCommand | null;
  backgroundOpacity: CompactCommand | null;
  font: CompactCommand | null;
  fontSize: CompactCommand | null;
  shadow: CompactCommand | null;
  styles: CompactCommand[];
  template: CompactCommand | null;
  textColor: CompactCommand | null;
  textOpacity: CompactCommand | null;
  verticalAlign: CompactCommand | null;
}

function collectTextCommands(commands: CompactCommand[]): TextToolbarCommands {
  return {
    align: getToolbarCommand(commands, 'text-align'),
    background: getToolbarCommand(commands, 'text-background'),
    backgroundOpacity: getToolbarCommand(commands, 'text-background-opacity'),
    font: getToolbarCommand(commands, 'text-font'),
    fontSize: getToolbarCommand(commands, 'text-font-size'),
    shadow: getToolbarCommand(commands, 'text-shadow'),
    styles: [
      getToolbarCommand(commands, 'text-bold'),
      getToolbarCommand(commands, 'text-italic'),
      getToolbarCommand(commands, 'text-underline'),
      getToolbarCommand(commands, 'text-linethrough'),
    ].filter(isToolbarCommand),
    template: getToolbarCommand(commands, 'text-template'),
    textColor: getToolbarCommand(commands, 'text-color'),
    textOpacity: getToolbarCommand(commands, 'text-opacity'),
    verticalAlign: getToolbarCommand(commands, 'text-vertical-align'),
  };
}

function parseOpacity(command: CompactCommand | null) {
  return parseToolbarPercent(command?.value);
}

function TextGeometryContent(props: {
  align: CompactCommand | null;
  styles: CompactCommand[];
  verticalAlign: CompactCommand | null;
}) {
  return (
    <div className="space-y-3">
      {props.styles.length > 0 ? (
        <div
          onMouseDown={(event) => {
            event.preventDefault();
          }}
        >
          <ToggleGrid
            ariaLabel={translate('editor.compact.typography')}
            options={props.styles.map((command) => ({
              active: command.active ?? false,
              icon: command.trigger,
              label: command.title,
              onToggle: () => {
                void command.onClick?.();
              },
            }))}
          />
        </div>
      ) : null}
      {props.align ? renderFloatingToolbarCommandBody(props.align, { hideLabel: true }) : null}
      {props.verticalAlign
        ? renderFloatingToolbarCommandBody(props.verticalAlign, { hideLabel: true })
        : null}
    </div>
  );
}

function createTextGroup(args: {
  commands?: CompactCommand[];
  content?: React.ReactNode;
  id: TextToolbarGroupId;
  title: string;
  trigger: React.ReactNode;
  width?: FloatingToolbarGroup['width'];
}): FloatingToolbarGroup | null {
  const hasCommands = (args.commands?.length ?? 0) > 0;
  if (!hasCommands && !args.content) {
    return null;
  }

  return {
    id: args.id,
    kind:
      args.id === 'templates'
        ? 'templates'
        : args.id === 'shadow'
          ? 'effects'
          : args.id === 'fill'
            ? 'fill'
            : args.id === 'text-color'
              ? 'stroke'
              : args.id === 'geometry' || args.id === 'font-size'
                ? 'geometry'
                : 'content',
    title: args.title,
    trigger: args.trigger,
    content: args.content ?? renderToolbarGroupContent(args.commands ?? []),
    width: args.width ?? 'style',
  };
}

function createTextColorGroup(textCommands: TextToolbarCommands) {
  const textColor = textCommands.textColor?.value ?? 'currentColor';

  return createTextGroup({
    id: 'text-color',
    title: translate('editor.compact.textColor'),
    commands: [textCommands.textColor, textCommands.textOpacity].filter(isToolbarCommand),
    trigger: (
      <TypeOutlineColorIcon color={textColor} opacity={parseOpacity(textCommands.textOpacity)} />
    ),
  });
}

function createTextFillGroup(textCommands: TextToolbarCommands) {
  const fillColor = textCommands.background?.value ?? 'currentColor';

  return createTextGroup({
    id: 'fill',
    title: translate('editor.compact.backgroundColor'),
    commands: [textCommands.background, textCommands.backgroundOpacity].filter(isToolbarCommand),
    trigger: (
      <TablerColorIcon
        color={fillColor}
        icon={
          parseOpacity(textCommands.backgroundOpacity) <= 0 ? 'tabler:bucket-off' : 'tabler:bucket'
        }
        opacity={parseOpacity(textCommands.backgroundOpacity)}
      />
    ),
  });
}

function createTextGeometryGroup(textCommands: TextToolbarCommands) {
  return createTextGroup({
    id: 'geometry',
    title: translate('editor.compact.typography'),
    content: (
      <TextGeometryContent
        align={textCommands.align}
        styles={textCommands.styles}
        verticalAlign={textCommands.verticalAlign}
      />
    ),
    trigger: <TablerIcon icon="tabler:text-color" />,
    width: 'style',
  });
}

function createTextShadowGroup(textCommands: TextToolbarCommands) {
  return createTextGroup({
    id: 'shadow',
    title: translate('highlighter.editor.shadowLabel'),
    commands: textCommands.shadow ? [textCommands.shadow] : [],
    trigger: textCommands.shadow?.trigger ?? <TablerIcon icon="tabler:shadow-off" opacity={0.65} />,
    width: CANVAS_TOOLBAR_GROUP_WIDTHS.effects,
  });
}

function renderTextFontTrigger(
  textCommands: TextToolbarCommands,
  mode: TextToolbarFontTriggerMode
) {
  if (mode === 'icon') {
    return <TablerIcon icon="tabler:text-size" />;
  }

  return (
    <span className="whitespace-nowrap px-2 text-sm font-medium normal-case tracking-normal">
      {textCommands.font?.value ?? translate('editor.compact.font')}
    </span>
  );
}

export function isTextToolbarCommandSet(commands: CompactCommand[]): boolean {
  return commands.some((command) => command.id.startsWith('text-'));
}

export function sortTextToolbarGroups(groups: FloatingToolbarGroup[]): FloatingToolbarGroup[] {
  return groups.sort(
    (left, right) =>
      TEXT_TOOLBAR_GROUP_ORDER.indexOf(left.id as TextToolbarGroupId) -
      TEXT_TOOLBAR_GROUP_ORDER.indexOf(right.id as TextToolbarGroupId)
  );
}

export function createTextToolbarGroups(
  commands: CompactCommand[],
  options: { fontTrigger?: TextToolbarFontTriggerMode } = {}
): FloatingToolbarGroup[] | null {
  if (!isTextToolbarCommandSet(commands)) {
    return null;
  }

  const textCommands = collectTextCommands(commands);
  const groups = [
    createTextGroup({
      id: 'templates',
      title: CANVAS_TOOLBAR_GROUP_TITLES.templates,
      commands: textCommands.template ? [textCommands.template] : [],
      trigger: <TablerIcon icon="tabler:template" />,
    }),
    createTextGroup({
      id: 'font',
      title: translate('editor.compact.font'),
      commands: textCommands.font ? [textCommands.font] : [],
      trigger: renderTextFontTrigger(textCommands, options.fontTrigger ?? 'label'),
    }),
    createTextGroup({
      id: 'font-size',
      title: translate('editor.compact.fontSize'),
      commands: textCommands.fontSize ? [textCommands.fontSize] : [],
      trigger: textCommands.fontSize?.trigger ?? null,
    }),
    createTextColorGroup(textCommands),
    createTextFillGroup(textCommands),
    createTextGeometryGroup(textCommands),
    createTextShadowGroup(textCommands),
  ];

  return sortTextToolbarGroups(
    groups.filter((group): group is FloatingToolbarGroup => group !== null)
  );
}
