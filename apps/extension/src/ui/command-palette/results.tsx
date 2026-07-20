import { Search } from 'lucide-react';
import { translate } from '../../platform/i18n';
import type { CommandPaletteAction, LocalizedCommandPaletteGroup } from './types';

function buildResultRowClassName(selected: boolean, disabled: boolean | undefined): string {
  return [
    'flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
    selected
      ? [
          [
            'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_18%,',
            'var(--sniptale-color-border-soft)_82%)]',
          ].join(''),
          [
            'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_4%,',
            'var(--sniptale-color-surface-hover)_96%)]',
          ].join(''),
          'text-[var(--sniptale-color-text-primary)]',
        ].join(' ')
      : [
          'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_46%,transparent)]',
          'text-[var(--sniptale-color-text-secondary)]',
          'hover:bg-[var(--sniptale-color-surface-hover)]',
          'hover:text-[var(--sniptale-color-text-primary)]',
        ].join(' '),
    disabled ? 'cursor-not-allowed opacity-60' : '',
  ].join(' ');
}

function buildResultAccessoryClassName(selected: boolean) {
  return [
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_78%,transparent)]',
    selected
      ? 'text-[var(--sniptale-color-accent-emphasis)]'
      : 'text-[var(--sniptale-color-text-muted-strong)]',
  ].join(' ');
}

function CommandPaletteResultRow(props: {
  action: CommandPaletteAction;
  selected: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={props.selected}
      data-selected={props.selected ? 'true' : 'false'}
      disabled={props.action.disabled}
      onClick={props.onSelect}
      onMouseMove={props.onHover}
      className={buildResultRowClassName(props.selected, props.action.disabled)}
    >
      <span
        className={[
          'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          buildResultAccessoryClassName(props.selected),
        ].join(' ')}
      >
        {props.action.icon ?? <Search size={16} strokeWidth={1.75} />}
      </span>
      <CommandPaletteResultCopy action={props.action} />
      <CommandPaletteShortcut
        {...(props.action.shortcut === undefined ? {} : { shortcut: props.action.shortcut })}
      />
    </button>
  );
}

function CommandPaletteResultCopy(props: { action: CommandPaletteAction }) {
  const secondaryCopy = props.action.disabledReason ?? props.action.subtitle;

  return (
    <span className="min-w-0 flex-1">
      {props.action.section ? (
        <span className="mb-1 block text-[11px] uppercase tracking-wider text-[var(--sniptale-color-text-dim)]">
          {props.action.section}
        </span>
      ) : null}
      <span className="block text-sm font-medium text-inherit">{props.action.title}</span>
      {secondaryCopy ? (
        <span className="mt-1 block text-xs leading-5 text-[var(--sniptale-color-text-dim)]">
          {secondaryCopy}
        </span>
      ) : null}
    </span>
  );
}

function CommandPaletteShortcut(props: { shortcut?: string }) {
  if (!props.shortcut) return null;

  return (
    <span
      className={[
        'mt-0.5 shrink-0 rounded-md px-2 py-1 text-xs font-medium tracking-wide',
        buildResultAccessoryClassName(false),
      ].join(' ')}
    >
      {props.shortcut}
    </span>
  );
}

export function CommandPaletteEmptyState() {
  return (
    <div
      className={[
        'rounded-xl border border-[var(--sniptale-color-border-soft)] px-4 py-6 text-center',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_38%,transparent)]',
      ].join(' ')}
    >
      <div className="text-sm font-medium text-[var(--sniptale-color-text-primary)]">
        {translate('shared.ui.commandPaletteEmptyTitle')}
      </div>
      <div className="mt-2 text-xs leading-5 text-[var(--sniptale-color-text-dim)]">
        {translate('shared.ui.commandPaletteEmptyDescription')}
      </div>
    </div>
  );
}

function CommandPaletteGroup(props: {
  group: LocalizedCommandPaletteGroup;
  flatActionIds: readonly string[];
  selectedIndex: number;
  onHoverAction: (actionId: string) => void;
  onSelectAction: (action: CommandPaletteAction) => void;
}) {
  return (
    <section key={props.group.id} className="space-y-1.5">
      <div
        className={
          'px-2 text-xs font-semibold uppercase tracking-wider ' +
          'text-[var(--sniptale-color-text-dim)]'
        }
      >
        {props.group.label}
      </div>
      {props.group.actions.map((action) => (
        <CommandPaletteResultRow
          key={action.id}
          action={action}
          selected={props.selectedIndex === props.flatActionIds.indexOf(action.id)}
          onHover={() => props.onHoverAction(action.id)}
          onSelect={() => props.onSelectAction(action)}
        />
      ))}
    </section>
  );
}

export function CommandPaletteResults(props: {
  groups: LocalizedCommandPaletteGroup[];
  flatActionIds: readonly string[];
  selectedIndex: number;
  onHoverAction: (actionId: string) => void;
  onSelectAction: (action: CommandPaletteAction) => void;
}) {
  return (
    <div className="space-y-3">
      {props.groups.map((group) =>
        group.actions.length > 0 ? (
          <CommandPaletteGroup
            key={group.id}
            group={group}
            flatActionIds={props.flatActionIds}
            selectedIndex={props.selectedIndex}
            onHoverAction={props.onHoverAction}
            onSelectAction={props.onSelectAction}
          />
        ) : null
      )}
    </div>
  );
}
