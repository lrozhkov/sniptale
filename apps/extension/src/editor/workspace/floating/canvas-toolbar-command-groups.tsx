import React from 'react';
import { EllipsisVertical } from 'lucide-react';
import type { CompactCommand } from '../../inspector/compact';
import {
  renderCompactCommandContent,
  resolveCompactCommandTrigger,
} from '../../inspector/compact/shared';
import { OptionRow } from '../../chrome/ui';
import {
  CANVAS_TOOLBAR_GROUP_ORDER,
  CANVAS_TOOLBAR_GROUP_TITLES,
  CANVAS_TOOLBAR_GROUP_WIDTHS,
  type FloatingToolbarGroup,
  type FloatingToolbarGroupKind,
  getCanvasToolbarGroupTrigger,
} from './canvas-toolbar-model';

export function renderFloatingToolbarCommandBody(
  command: CompactCommand,
  options: { hideLabel?: boolean; hideValue?: boolean } = {}
): React.ReactNode {
  if (command.content) {
    return renderCompactCommandContent(command, {
      hideLabel: options.hideLabel ?? false,
      hideValue: options.hideValue ?? true,
    });
  }

  return command.active === undefined ? renderButtonCommand(command) : renderToggleCommand(command);
}

function renderToggleCommand(command: CompactCommand): React.ReactNode {
  return (
    <OptionRow
      active={command.active}
      disabled={command.disabled}
      label={command.title}
      value={command.value ?? resolveCompactCommandTrigger(command)}
      onToggle={() => {
        void command.onClick?.();
      }}
    />
  );
}

function renderButtonCommand(command: CompactCommand): React.ReactNode {
  return (
    <button
      type="button"
      className={[
        'flex w-full items-center justify-between gap-3 rounded-[8px] px-2.5 py-2',
        'text-left text-sm text-[var(--sniptale-color-text-primary)]',
        command.active
          ? [
              'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_12%,transparent)]',
              'text-[color:var(--sniptale-color-accent)]',
              'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_28%,transparent)]',
            ].join(' ')
          : 'hover:bg-[var(--sniptale-color-surface-hover)]',
        'disabled:opacity-50',
      ].join(' ')}
      disabled={command.disabled}
      {...(command.active === undefined ? {} : { 'aria-pressed': command.active })}
      onClick={() => {
        void command.onClick?.();
      }}
    >
      <span className="min-w-0 truncate">{command.title}</span>
      {command.trigger ? (
        <span className="shrink-0 text-[var(--sniptale-color-text-muted)]">
          {resolveCompactCommandTrigger(command)}
        </span>
      ) : null}
    </button>
  );
}

function isContentCommand(commandId: string): boolean {
  return (
    commandId.startsWith('text-font') ||
    commandId === 'text-bold' ||
    commandId === 'text-italic' ||
    commandId === 'text-underline' ||
    commandId === 'text-linethrough' ||
    commandId === 'step-type' ||
    commandId === 'step-value' ||
    commandId === 'step-alphabet' ||
    commandId === 'step-text-color' ||
    commandId === 'blur-type' ||
    commandId === 'blur-amount' ||
    commandId === 'raster-selection-mode' ||
    commandId === 'raster-fill-mode' ||
    commandId.startsWith('crop-')
  );
}

function isFillCommand(commandId: string): boolean {
  return (
    commandId.includes('fill') ||
    commandId === 'text-color' ||
    commandId.startsWith('text-background') ||
    commandId === 'step-color' ||
    commandId === 'step-opacity' ||
    commandId === 'rich-shape-fill'
  );
}

function isGeometryCommand(commandId: string): boolean {
  return (
    commandId.endsWith('-radius') ||
    commandId.endsWith('-size') ||
    commandId.endsWith('-smoothing') ||
    commandId.includes('dynamic-width') ||
    commandId.includes('-head') ||
    commandId === 'arrow-type' ||
    commandId === 'rich-shape-tail'
  );
}

function isStrokeCommand(commandId: string): boolean {
  return (
    commandId.includes('stroke') ||
    commandId.endsWith('-color') ||
    commandId.endsWith('-width') ||
    commandId.endsWith('-opacity') ||
    commandId.endsWith('-style') ||
    commandId === 'line-style' ||
    commandId === 'rich-shape-line'
  );
}

function resolveCommandGroupKind(commandId: string): FloatingToolbarGroupKind {
  if (commandId.includes('preset') || commandId.includes('template')) {
    return 'templates';
  }
  if (isContentCommand(commandId)) {
    return 'content';
  }
  if (commandId === 'rich-shape-text') {
    return 'content';
  }
  if (commandId === 'text-align' || commandId === 'text-vertical-align') {
    return 'layout';
  }
  if (isFillCommand(commandId)) {
    return 'fill';
  }
  if (isGeometryCommand(commandId)) {
    return 'geometry';
  }
  if (isStrokeCommand(commandId)) {
    return 'stroke';
  }
  if (
    commandId.includes('shadow') ||
    commandId.includes('roughness') ||
    commandId.includes('bowing') ||
    commandId.includes('effects')
  ) {
    return 'effects';
  }

  return 'more';
}

function groupCommands(
  commands: CompactCommand[]
): Map<FloatingToolbarGroupKind, CompactCommand[]> {
  const grouped = new Map<FloatingToolbarGroupKind, CompactCommand[]>();

  commands.forEach((command) => {
    const kind = resolveCommandGroupKind(command.id);
    const current = grouped.get(kind) ?? [];
    current.push(command);
    grouped.set(kind, current);
  });

  return grouped;
}

export function createCanvasCommandGroups(commands: CompactCommand[]): FloatingToolbarGroup[] {
  const grouped = groupCommands(commands);

  return CANVAS_TOOLBAR_GROUP_ORDER.flatMap((kind) => {
    const kindCommands = grouped.get(kind) ?? [];
    if (kindCommands.length === 0 || kind === 'more') {
      return [];
    }

    return [
      {
        id: kind,
        kind,
        title: CANVAS_TOOLBAR_GROUP_TITLES[kind],
        trigger: getCanvasToolbarGroupTrigger(kind, kindCommands) ?? (
          <EllipsisVertical size={15} strokeWidth={2} />
        ),
        content: renderCommandGroupBody(kindCommands),
        width: CANVAS_TOOLBAR_GROUP_WIDTHS[kind],
      },
    ];
  });
}
function renderCommandGroupBody(commands: CompactCommand[]): React.ReactNode {
  return (
    <div className="space-y-4">
      {commands.map((command) => (
        <div key={command.id}>{renderFloatingToolbarCommandBody(command, { hideLabel: true })}</div>
      ))}
    </div>
  );
}
