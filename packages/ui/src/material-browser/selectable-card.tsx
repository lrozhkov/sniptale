import type { ReactNode } from 'react';
import { MaterialBrowser } from './index';
/** Presentation only: callers own selection, acquisition, retry and locale text. */
export function SelectableMaterialCard(props: {
  disabled: boolean;
  title: string;
  onSelect(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      title={props.title}
      onClick={props.onSelect}
      className={[
        'flex min-h-0 flex-col overflow-hidden rounded border text-left',
        'border-[var(--sniptale-color-border-subtle)]',
        'hover:border-[var(--sniptale-color-text-secondary)] disabled:opacity-50',
      ].join(' ')}
    >
      <span className="block h-44 w-full shrink-0 bg-[var(--sniptale-color-surface-canvas)]">
        {props.children}
      </span>
      <span className="block w-full shrink-0 truncate p-2 text-xs">{props.title}</span>
    </button>
  );
}
export function SelectableMaterialGrid(props: {
  label: string;
  status: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 p-4">
      <MaterialBrowser
        labels={{ list: props.label, show: props.label, hide: props.label }}
        listClassName="auto-rows-max"
        status={props.status}
      >
        {props.children}
      </MaterialBrowser>
    </div>
  );
}
