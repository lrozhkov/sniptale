import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { SettingsTransferTreeNode } from '../../../../contracts/settings-transfer';
import type { TranslationKey } from '../../../../platform/i18n';
import { translate } from '../../../../platform/i18n';

const requiredBadgeClassName =
  'rounded-full bg-[var(--sniptale-color-accent-soft)] px-2 py-0.5 text-[10px] ' +
  'text-[var(--sniptale-color-accent)]';

export function SettingsTransferTree(props: {
  nodes: readonly SettingsTransferTreeNode[];
  selected: ReadonlySet<string>;
  onToggle: (node: SettingsTransferTreeNode, checked: boolean) => void;
}) {
  const flatNodes = useMemo(() => flatten(props.nodes), [props.nodes]);
  const [activeId, setActiveId] = useState(() => flatNodes[0]?.id ?? '');
  const treeItemRefs = useRef(new Map<string, HTMLLIElement>());
  const checkboxRefs = useRef(new Map<string, HTMLInputElement>());
  useEffect(() => {
    if (!flatNodes.some((node) => node.id === activeId)) setActiveId(flatNodes[0]?.id ?? '');
  }, [activeId, flatNodes]);
  const focusNode = (id: string) => {
    setActiveId(id);
    treeItemRefs.current.get(id)?.focus();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const currentIndex = flatNodes.findIndex((node) => node.id === activeId);
    if (currentIndex < 0) return;
    const current = flatNodes[currentIndex];
    let targetId: string | undefined;
    if (event.key === 'ArrowDown') targetId = flatNodes[currentIndex + 1]?.id;
    if (event.key === 'ArrowUp') targetId = flatNodes[currentIndex - 1]?.id;
    if (event.key === 'Home') targetId = flatNodes[0]?.id;
    if (event.key === 'End') targetId = flatNodes.at(-1)?.id;
    if (event.key === 'ArrowRight') targetId = current?.children[0]?.id;
    if (event.key === 'ArrowLeft') targetId = current?.parentId ?? undefined;
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      checkboxRefs.current.get(activeId)?.click();
      return;
    }
    if (!targetId) return;
    event.preventDefault();
    focusNode(targetId);
  };
  return (
    <ul
      role="tree"
      aria-label={translate('settings.settingsTransfer.treeLabel')}
      className="space-y-1"
      onKeyDown={handleKeyDown}
    >
      {props.nodes.map((node) => (
        <TreeNode
          key={node.id}
          {...props}
          node={node}
          level={1}
          activeId={activeId}
          onActivate={setActiveId}
          registerTreeItem={(id, element) => {
            if (element) treeItemRefs.current.set(id, element);
            else treeItemRefs.current.delete(id);
          }}
          registerCheckbox={(id, element) => {
            if (element) checkboxRefs.current.set(id, element);
            else checkboxRefs.current.delete(id);
          }}
        />
      ))}
    </ul>
  );
}

function TreeNode(props: {
  node: SettingsTransferTreeNode;
  level: number;
  selected: ReadonlySet<string>;
  onToggle: (node: SettingsTransferTreeNode, checked: boolean) => void;
  nodes: readonly SettingsTransferTreeNode[];
  activeId: string;
  onActivate: (id: string) => void;
  registerTreeItem: (id: string, element: HTMLLIElement | null) => void;
  registerCheckbox: (id: string, element: HTMLInputElement | null) => void;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const descendants = flatten(props.node.children);
  const checked = props.selected.has(props.node.id);
  const selectedDescendants = descendants.filter((node) => props.selected.has(node.id)).length;
  const indeterminate = !checked && selectedDescendants > 0;
  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = indeterminate;
  }, [indeterminate]);
  const isDynamicItem = props.node.kind === 'item';
  const label = isDynamicItem
    ? props.node.labelKey
    : translate(props.node.labelKey as TranslationKey);
  return (
    <li
      ref={(element) => props.registerTreeItem(props.node.id, element)}
      role="treeitem"
      aria-level={props.level}
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-expanded={props.node.children.length > 0 ? true : undefined}
      tabIndex={props.activeId === props.node.id ? 0 : -1}
      onFocus={(event) => {
        if (event.currentTarget === event.target) props.onActivate(props.node.id);
      }}
      className="outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]"
    >
      <label className="flex min-h-9 items-center gap-2 rounded-lg px-2 hover:bg-[var(--sniptale-color-surface-hover)]">
        <input
          ref={(element) => {
            checkboxRef.current = element;
            props.registerCheckbox(props.node.id, element);
          }}
          type="checkbox"
          checked={checked}
          tabIndex={-1}
          onChange={(event) => props.onToggle(props.node, event.currentTarget.checked)}
        />
        <span className="min-w-0 flex-1 truncate text-sm text-[var(--sniptale-color-text-primary)]">
          {label}
        </span>
        {props.node.requiredBy.length > 0 ? (
          <span className={requiredBadgeClassName}>
            {translate('settings.settingsTransfer.required')}
          </span>
        ) : null}
      </label>
      {props.node.children.length > 0 ? (
        <ul role="group" className="ml-5 border-l border-[var(--sniptale-color-border-soft)] pl-2">
          {props.node.children.map((child) => (
            <TreeNode key={child.id} {...props} node={child} level={props.level + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function flatten(nodes: readonly SettingsTransferTreeNode[]): SettingsTransferTreeNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}
