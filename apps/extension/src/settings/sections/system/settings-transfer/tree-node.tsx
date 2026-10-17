import { ChevronRight } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { SettingsTransferTreeNode } from '../../../../contracts/settings-transfer';
import { translate } from '../../../../platform/i18n';
import { flattenTransferTreeNodes, getTransferNodeDisplayName } from './tree-model';

const requiredBadgeClassName = 'text-[11px] text-[var(--sniptale-color-text-secondary)]';
const treeRowClassName = [
  'flex min-h-8 items-center gap-1 rounded-[4px] px-1',
  'hover:bg-[var(--sniptale-color-surface-hover)]',
].join(' ');
const treeLabelTextClassName = [
  'min-w-0 flex-1 truncate text-[13px] font-normal leading-[18px]',
  'text-[var(--sniptale-color-text-primary)]',
].join(' ');

type SettingsTransferTreeNodeProps = {
  node: SettingsTransferTreeNode;
  required?: boolean;
  level: number;
  selected: ReadonlySet<string>;
  onToggle: (node: SettingsTransferTreeNode, checked: boolean) => void;
  activeId: string;
  expandedIds: ReadonlySet<string>;
  onActivate: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  registerTreeItem: (id: string, element: HTMLLIElement | null) => void;
  registerCheckbox: (id: string, element: HTMLInputElement | null) => void;
};

export function SettingsTransferTreeNodeItem(props: SettingsTransferTreeNodeProps) {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const descendants = flattenTransferTreeNodes(props.node.children);
  const checked = props.selected.has(props.node.id);
  const required =
    checked && (props.required || props.node.requiredBy.some((id) => props.selected.has(id)));
  const disabled = !props.node.selectable || required;
  const name = getTransferNodeDisplayName(props.node);
  const selectedDescendants = descendants.filter((node) => props.selected.has(node.id)).length;
  const indeterminate = !checked && selectedDescendants > 0;
  const expandable = props.node.children.length > 0;
  const expanded = expandable && props.expandedIds.has(props.node.id);
  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <li
      ref={(element) => props.registerTreeItem(props.node.id, element)}
      role="treeitem"
      aria-level={props.level}
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-expanded={expandable ? expanded : undefined}
      tabIndex={props.activeId === props.node.id ? 0 : -1}
      onFocus={(event) => {
        if (event.currentTarget === event.target) props.onActivate(props.node.id);
      }}
      className="outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]"
    >
      <div className={treeRowClassName}>
        {expandable ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={translate(
              expanded
                ? 'settings.settingsTransfer.collapseNode'
                : 'settings.settingsTransfer.expandNode'
            )}
            onClick={() => props.onToggleExpanded(props.node.id)}
            className="grid size-7 shrink-0 place-items-center rounded-md"
          >
            <ChevronRight
              aria-hidden="true"
              size={15}
              className={expanded ? 'rotate-90 transition-transform' : 'transition-transform'}
            />
          </button>
        ) : (
          <span className="size-7 shrink-0" />
        )}
        <label
          className={[
            'flex min-w-0 flex-1 items-center gap-2 py-1',
            disabled ? 'cursor-default opacity-50' : 'cursor-pointer',
          ].join(' ')}
        >
          <input
            className="sniptale-parameter-check m-0! shrink-0 disabled:opacity-100!"
            disabled={disabled}
            ref={(element) => {
              checkboxRef.current = element;
              props.registerCheckbox(props.node.id, element);
            }}
            type="checkbox"
            checked={checked}
            tabIndex={-1}
            onChange={(event) => props.onToggle(props.node, event.currentTarget.checked)}
          />
          <span className={treeLabelTextClassName} title={`${name} (${props.node.id})`}>
            {name}
          </span>
          {required ? (
            <span className={requiredBadgeClassName}>
              {translate('settings.settingsTransfer.required')}
            </span>
          ) : null}
        </label>
      </div>
      {expanded ? (
        <ul role="group" className="ml-5 border-l border-[var(--sniptale-color-border-soft)] pl-2">
          {props.node.children.map((child) => (
            <SettingsTransferTreeNodeItem
              key={child.id}
              {...props}
              node={child}
              required={required}
              level={props.level + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
