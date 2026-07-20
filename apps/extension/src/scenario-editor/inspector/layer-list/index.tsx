import type { ReactNode } from 'react';

import { cx } from '../../../ui/compact-inspector-controls';
import { EditorIconButton } from '@sniptale/ui/editor-chrome';

export interface ProductLayerListAction {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}

export interface ProductLayerListItem {
  id: string;
  title: string;
  meta: string;
  selected: boolean;
  preview?: ReactNode;
  actions: ProductLayerListAction[];
}

export interface ProductLayerListProps {
  emptyLabel: string;
  items: ProductLayerListItem[];
  onSelectItem: (itemId: string) => void;
  dataUi?: string;
}

const LIST_CLASS_NAME = 'grid gap-2';
const ROW_CLASS_NAME = [
  'group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-[12px] border',
  'border-[color:var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_72%,transparent)]',
  'p-1.5 transition',
].join(' ');
const ROW_SELECTED_CLASS_NAME = [
  'border-[color:var(--sniptale-color-border-accent-strong)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_72%,transparent)]',
  'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_12%,transparent)]',
].join(' ');
const PREVIEW_CLASS_NAME = [
  'flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border',
  'border-[color:var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_82%,transparent)]',
  'text-[color:var(--sniptale-color-text-secondary)]',
].join(' ');
const TRIGGER_CLASS_NAME = [
  'flex min-h-11 min-w-0 w-full flex-1 items-center overflow-hidden rounded-[10px]',
  'px-1.5 py-1 text-left transition',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
  'focus-visible:outline-none',
  'focus-visible:ring-2',
  'focus-visible:ring-[color:color-mix(in_srgb,var(--sniptale-color-accent)_42%,transparent)]',
].join(' ');
const EMPTY_CLASS_NAME = [
  'rounded-[12px] border border-[color:var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_74%,transparent)]',
  'px-4 py-5 text-center text-sm text-[color:var(--sniptale-color-text-muted)]',
].join(' ');

export function ProductLayerList({
  dataUi,
  emptyLabel,
  items,
  onSelectItem,
}: ProductLayerListProps) {
  return (
    <div className={LIST_CLASS_NAME} data-ui={dataUi ?? 'shared.ui.layer-list'}>
      {items.length > 0 ? (
        items.map((item) => (
          <ProductLayerRow key={item.id} item={item} onSelectItem={onSelectItem} />
        ))
      ) : (
        <div className={EMPTY_CLASS_NAME}>{emptyLabel}</div>
      )}
    </div>
  );
}

function ProductLayerRow(props: {
  item: ProductLayerListItem;
  onSelectItem: ProductLayerListProps['onSelectItem'];
}) {
  return (
    <div className={cx(ROW_CLASS_NAME, props.item.selected && ROW_SELECTED_CLASS_NAME)}>
      <span className={PREVIEW_CLASS_NAME} aria-hidden="true">
        {props.item.preview}
      </span>
      <button
        type="button"
        title={props.item.title}
        aria-pressed={props.item.selected}
        className={TRIGGER_CLASS_NAME}
        onClick={() => props.onSelectItem(props.item.id)}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-[var(--sniptale-color-text-primary)]">
            {props.item.title}
          </span>
          <span className="block truncate text-xs text-[var(--sniptale-color-text-muted)]">
            {props.item.meta}
          </span>
        </span>
      </button>
      <ProductLayerActionRail actions={props.item.actions} />
    </div>
  );
}

function ProductLayerActionRail(props: { actions: ProductLayerListAction[] }) {
  return (
    <div
      className="flex shrink-0 items-center gap-0.5"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {props.actions.map((action) => (
        <EditorIconButton
          key={action.label}
          title={action.label}
          active={action.active ?? false}
          danger={action.destructive ?? false}
          disabled={action.disabled ?? false}
          onClick={action.onClick}
          className="h-[26px] w-[26px] shrink-0"
        >
          {action.icon}
        </EditorIconButton>
      ))}
    </div>
  );
}
