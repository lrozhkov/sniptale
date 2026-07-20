import type React from 'react';
import type { CompactCommand } from '../../inspector/compact';
import { renderFloatingToolbarCommandBody } from './canvas-toolbar-command-groups';
import {
  CANVAS_TOOLBAR_GROUP_WIDTHS,
  type FloatingToolbarGroup,
  type FloatingToolbarGroupKind,
} from './canvas-toolbar-model';

export type ToolbarGroupSpec<TId extends string> = {
  commands: CompactCommand[];
  content?: React.ReactNode;
  hideValue?: boolean;
  id: TId;
  kind: FloatingToolbarGroupKind;
  title: string;
  trigger: React.ReactNode;
  width?: FloatingToolbarGroup['width'];
};

export function getToolbarCommand(commands: CompactCommand[], id: string): CompactCommand | null {
  return commands.find((command) => command.id === id) ?? null;
}

export function isToolbarCommand(command: CompactCommand | null): command is CompactCommand {
  return command !== null;
}

export function renderToolbarGroupContent(
  commands: CompactCommand[],
  options: { hideValue?: boolean } = {}
) {
  return (
    <div className="space-y-4">
      {commands.map((command) => (
        <div key={command.id}>
          {renderFloatingToolbarCommandBody(command, {
            hideLabel: true,
            hideValue: options.hideValue ?? true,
          })}
        </div>
      ))}
    </div>
  );
}

export function createToolbarGroup<TId extends string>(
  args: ToolbarGroupSpec<TId>
): FloatingToolbarGroup | null {
  if (args.commands.length === 0) {
    return null;
  }

  return {
    id: args.id,
    kind: args.kind,
    title: args.title,
    trigger: args.trigger,
    content:
      args.content ??
      renderToolbarGroupContent(
        args.commands,
        args.hideValue === undefined ? {} : { hideValue: args.hideValue }
      ),
    width: args.width ?? CANVAS_TOOLBAR_GROUP_WIDTHS[args.kind],
  };
}

export function parseToolbarPercent(value: string | undefined): number {
  if (!value?.endsWith('%')) {
    return 1;
  }

  return Math.max(0, Math.min(1, Number.parseInt(value, 10) / 100));
}

export function parseToolbarPixel(value: string | undefined): number {
  if (!value?.endsWith('px')) {
    return 0;
  }

  return Number.parseFloat(value);
}
