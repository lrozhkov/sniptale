import { SlidersHorizontal } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { CompactCommandToken, type CompactCommand } from '../../inspector/compact';
import { resolveCompactCommandTrigger } from '../../inspector/compact/shared';
import type { FloatingToolbarGroup } from './canvas-toolbar-model';
import { createArrowToolbarGroups } from './arrow-toolbar-groups';
import { createBlurToolbarGroups } from './blur-toolbar-groups';
import { createBrushToolbarGroups } from './brush-toolbar-groups';
import { createLineToolbarGroups } from './line-toolbar-groups';
import { createRasterToolbarGroups } from './raster-toolbar-groups';
import { createShapeToolbarGroups } from './shape-toolbar-groups';
import { createStepToolbarGroups } from './step-toolbar-groups';
import { createTextToolbarGroups } from './text-toolbar-groups';
import { createToolbarGroup } from './toolbar-group-builders';

function isTemplateCommand(command: CompactCommand): boolean {
  return command.id.includes('template') || command.id.includes('preset');
}

function isColorOrOpacityCommand(command: CompactCommand): boolean {
  return (
    command.id.endsWith('-color') ||
    command.id.includes('background') ||
    command.id.endsWith('-opacity') ||
    command.id === 'pencil-opacity' ||
    command.id === 'highlighter-opacity'
  );
}

function isSizeCommand(command: CompactCommand): boolean {
  if (command.id.includes('dynamic-width')) {
    return false;
  }

  return (
    command.id.endsWith('-width') || command.id.endsWith('-size') || command.id === 'text-font-size'
  );
}

function resolveSizeTrigger(commands: CompactCommand[]) {
  const firstCommand = commands[0];
  if (!firstCommand) {
    return <CompactCommandToken>PX</CompactCommandToken>;
  }

  if (commands.length === 1 && commands[0]?.value) {
    return (
      <CompactCommandToken className="min-w-8 text-center tracking-normal">
        {firstCommand.value}
      </CompactCommandToken>
    );
  }

  return resolveCompactCommandTrigger(firstCommand);
}

function resolveFirstCommandTrigger(commands: CompactCommand[], fallback: React.ReactNode) {
  const command = commands[0];
  return command ? resolveCompactCommandTrigger(command) : fallback;
}

function getGenericToolPropertyBuckets(commands: CompactCommand[]) {
  const templates = commands.filter(isTemplateCommand);
  const colors = commands.filter(
    (command) => !isTemplateCommand(command) && isColorOrOpacityCommand(command)
  );
  const sizes = commands.filter(
    (command) =>
      !isTemplateCommand(command) && !isColorOrOpacityCommand(command) && isSizeCommand(command)
  );
  const remaining = commands.filter(
    (command) =>
      !isTemplateCommand(command) && !isColorOrOpacityCommand(command) && !isSizeCommand(command)
  );

  return { colors, remaining, sizes, templates };
}

function createGenericToolPropertiesGroups(commands: CompactCommand[]): FloatingToolbarGroup[] {
  const buckets = getGenericToolPropertyBuckets(commands);
  const groups = [
    createToolbarGroup({
      id: 'templates',
      kind: 'templates',
      title: translate('editor.toolbar.preset'),
      commands: buckets.templates,
      trigger: resolveFirstCommandTrigger(
        buckets.templates,
        <SlidersHorizontal size={15} strokeWidth={2} />
      ),
      width: 'style',
    }),
    createToolbarGroup({
      id: 'color',
      kind: 'fill',
      title: translate('editor.toolbar.fillColor'),
      commands: buckets.colors,
      trigger: resolveFirstCommandTrigger(
        buckets.colors,
        <SlidersHorizontal size={15} strokeWidth={2} />
      ),
      width: 'style',
    }),
    createToolbarGroup({
      id: 'size',
      kind: 'geometry',
      title: translate('editor.toolbar.size'),
      commands: buckets.sizes,
      trigger: resolveSizeTrigger(buckets.sizes),
      width: 'simple',
    }),
    createToolbarGroup({
      id: 'settings',
      kind: 'effects',
      title: translate('editor.toolbar.effects'),
      commands: buckets.remaining,
      trigger: <SlidersHorizontal size={15} strokeWidth={2} />,
      width: 'rich',
    }),
  ];

  return groups.filter((group): group is FloatingToolbarGroup => group !== null);
}

export function createToolPropertiesGroups(commands: CompactCommand[]): FloatingToolbarGroup[] {
  return (
    createBrushToolbarGroups(commands) ??
    createBlurToolbarGroups(commands) ??
    createLineToolbarGroups(commands) ??
    createArrowToolbarGroups(commands) ??
    createShapeToolbarGroups(commands) ??
    createStepToolbarGroups(commands) ??
    createRasterToolbarGroups(commands) ??
    createTextToolbarGroups(commands, { fontTrigger: 'icon' }) ??
    createGenericToolPropertiesGroups(commands)
  );
}
