import type React from 'react';
import { Plus } from 'lucide-react';
import { cx } from './shared';

export interface PresetListItem {
  id: string;
  label: string;
  preview?: React.ReactNode;
  selected?: boolean;
  system?: boolean;
  onApply: () => void;
}

export interface PresetListGroup {
  id: string;
  label: string;
  templates: readonly PresetListItem[];
}

export function PresetRow({ item }: { item: PresetListItem }) {
  return (
    <button
      type="button"
      aria-pressed={item.selected}
      title={item.label}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        item.onApply();
      }}
      {...(item.system === undefined ? {} : { 'data-preset-system': String(item.system) })}
      data-ui="shared.ui.compact-inspector.preset-row"
      data-editor-template-card={item.id}
      data-preset-row={item.id}
      className={cx(
        'flex min-h-9 w-full items-center gap-3 rounded-[8px] border px-3 py-2 text-left',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
        'transition hover:border-[color:var(--sniptale-color-border-strong)]',
        item.selected &&
          'border-[color:var(--sniptale-color-accent)] bg-[color:var(--sniptale-color-accent-soft)]'
      )}
    >
      {item.preview ? (
        <span className="flex h-4 w-14 shrink-0 items-center justify-center text-[color:var(--sniptale-color-accent)]">
          {item.preview}
        </span>
      ) : null}
      <span
        className={[
          'min-w-0 flex-1 truncate text-[12px] font-semibold',
          'text-[color:var(--sniptale-color-text-primary)]',
        ].join(' ')}
      >
        {item.label}
      </span>
    </button>
  );
}

export function PresetGroup({ group }: { group: PresetListGroup }) {
  if (group.templates.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2" data-ui="shared.ui.compact-inspector.preset-group">
      <div className="flex items-center justify-between gap-3 px-1">
        <span className="text-[12px] font-bold uppercase text-[color:var(--sniptale-color-text-secondary)]">
          {group.label}
        </span>
        <span className="text-[12px] font-semibold text-[color:var(--sniptale-color-text-dim)]">
          {group.templates.length}
        </span>
      </div>
      <div className="space-y-1.5">
        {group.templates.map((item) => (
          <PresetRow key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

export function PresetList(props: {
  emptyLabel: React.ReactNode;
  groups: readonly PresetListGroup[];
  saveDisabled?: boolean | undefined;
  saveLabel?: React.ReactNode;
  onSave?: () => void;
}) {
  const nonEmptyGroups = props.groups.filter((group) => group.templates.length > 0);

  return (
    <div className="space-y-3" data-ui="shared.ui.compact-inspector.preset-list">
      {nonEmptyGroups.length > 0 ? (
        nonEmptyGroups.map((group) => <PresetGroup key={group.id} group={group} />)
      ) : (
        <EmptyState>{props.emptyLabel}</EmptyState>
      )}
      {props.onSave && props.saveLabel ? (
        <FileActionRow
          disabled={props.saveDisabled}
          icon={<Plus size={15} strokeWidth={2} />}
          onClick={props.onSave}
        >
          {props.saveLabel}
        </FileActionRow>
      ) : null}
    </div>
  );
}

export interface FileActionRowProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  icon?: React.ReactNode;
}

export function FileActionRow({
  children,
  className,
  icon,
  type,
  ...buttonProps
}: FileActionRowProps) {
  return (
    <button
      type={type ?? 'button'}
      {...buttonProps}
      className={cx(
        'flex min-h-10 w-full items-center justify-center gap-2 rounded-[10px] border px-3',
        'text-[12px] font-semibold transition',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
        'text-[color:var(--sniptale-color-text-primary)]',
        'hover:border-[color:var(--sniptale-color-border-strong)]',
        buttonProps.disabled && 'cursor-not-allowed opacity-55',
        className
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cx(
        'rounded-[10px] border border-dashed px-3 py-4 text-center text-[12px] font-semibold',
        'border-[color:var(--sniptale-color-border-soft)]',
        'text-[color:var(--sniptale-color-text-muted)]'
      )}
    >
      {children}
    </div>
  );
}
