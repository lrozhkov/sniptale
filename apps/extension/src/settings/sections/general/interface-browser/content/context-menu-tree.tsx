import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Plus } from 'lucide-react';
import { settingsAddButtonClassName } from '../../../../section-surface';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import type { AppLocale } from '../../../../../platform/i18n';
import { translate } from '../../../../../platform/i18n';
import { contextMenuSectionTitle } from '../../../../../platform/i18n/context-menu-section-title';
import type {
  ContextMenuTree,
  ContextMenuTreeNode,
} from '../../../../../contracts/settings/context-menu-layout';
import { CONTEXT_MENU_MAX_SECTIONS } from '../../../../../contracts/settings/context-menu-layout';
import type { ContextMenuCatalogItem } from './context-menu-catalog';
import { contextMenuCommandLabel } from './context-menu-catalog';
import { ContextMenuTreeRow, treeIconButton } from './context-menu-tree-row';
import type { ContextMenuDropTarget } from './context-menu-tree-drop';
import {
  createSectionAtSelection,
  createTreeReorder,
  finishTreeRename,
  handleTreeMutationKey,
  toggleTreeSection,
} from './context-menu-tree-controller';
import {
  contextMenuNodePosition,
  countContextMenuSections,
  findContextMenuNode,
  hasDisabledContextMenuSection,
  removeContextMenuNode,
  restoreContextMenuSections,
  updateContextMenuNode,
  visibleContextMenuNodes,
} from './context-menu-tree-model';

type TreeViewProps = {
  tree: ContextMenuTree;
  drop?: ContextMenuDropTarget | null;
  catalog: readonly ContextMenuCatalogItem[];
  locale: AppLocale;
  selectedKey: string | null;
  focusRequest?: { key: string } | null;
  onSelect(key: string | null): void;
  onChange(tree: ContextMenuTree): void;
  expanded: ReadonlySet<string>;
  onExpanded(next: Set<string>): void;
  onAnnounce(message: string): void;
};

function removeWithNeighbor(
  tree: ContextMenuTree,
  key: string,
  expanded: ReadonlySet<string>
): { next: ContextMenuTree; focusKey: string | null } {
  const before = visibleContextMenuNodes(tree, expanded);
  const next = removeContextMenuNode(tree, key);
  const after = visibleContextMenuNodes(next, expanded);
  const index = Math.min(
    before.findIndex((row) => row.key === key),
    after.length - 1
  );
  return { next, focusKey: after[index]?.key ?? null };
}

function handleTreeKey(
  event: KeyboardEvent<HTMLDivElement>,
  key: string,
  node: ContextMenuTreeNode,
  context: {
    rows: ReturnType<typeof visibleContextMenuNodes>;
    expanded: ReadonlySet<string>;
    tree: ContextMenuTree;
    toggleExpanded(id: string): void;
    select(key: string): void;
  }
) {
  const { rows, expanded, tree, toggleExpanded, select } = context;
  if (event.target !== event.currentTarget) return;
  const index = rows.findIndex((row) => row.key === key);
  let nextKey: string | undefined;
  switch (event.key) {
    case 'ArrowDown':
      nextKey = rows[index + 1]?.key;
      break;
    case 'ArrowUp':
      nextKey = rows[index - 1]?.key;
      break;
    case 'Home':
      nextKey = rows[0]?.key;
      break;
    case 'End':
      nextKey = rows.at(-1)?.key;
      break;
    case 'ArrowRight':
      if (node.type === 'section') {
        if (!expanded.has(node.id)) toggleExpanded(node.id);
        else
          nextKey =
            rows[index + 1]?.level === rows[index]!.level + 1 ? rows[index + 1]?.key : undefined;
      }
      break;
    case 'ArrowLeft':
      if (node.type === 'section' && expanded.has(node.id)) toggleExpanded(node.id);
      else {
        const position = contextMenuNodePosition(tree, key);
        if (position?.parentId) nextKey = `section:${position.parentId}`;
      }
      break;
    case 'Enter':
    case ' ':
      if (node.type === 'section') toggleExpanded(node.id);
      break;
    default:
      return;
  }
  event.preventDefault();
  if (nextKey) select(nextKey);
}

function useTreeFocus(props: TreeViewProps, editingKey: string | undefined) {
  const { tree, selectedKey, focusRequest, onSelect, expanded } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const focusPending = useRef(false);
  const consumedFocusRequest = useRef<TreeViewProps['focusRequest']>(null);
  useLayoutEffect(() => {
    if (!focusPending.current || !selectedKey) return;
    focusPending.current = false;
    const target = [
      ...(rootRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []),
    ].find((item) => item.dataset['treeKey'] === selectedKey);
    target?.focus();
  }, [tree, selectedKey, expanded, editingKey]);
  useLayoutEffect(() => {
    if (!focusRequest || consumedFocusRequest.current === focusRequest) return;
    const target = [
      ...(rootRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []),
    ].find((item) => item.dataset['treeKey'] === focusRequest.key);
    if (!target) return;
    consumedFocusRequest.current = focusRequest;
    target.focus();
  }, [focusRequest, tree, expanded]);
  const select = (key: string) => {
    focusPending.current = true;
    onSelect(key);
  };
  return { rootRef, select };
}

/** Owns keyboard, pointer and editing transactions for one disposable tree draft. */
function useContextMenuTree(props: TreeViewProps) {
  const { tree, locale, selectedKey, onSelect, onChange, expanded, onExpanded, onAnnounce } = props;
  const [editing, setEditing] = useState<{ key: string; value: string; isNew: boolean } | null>(
    null
  );
  const [pendingSectionRemoval, setPendingSectionRemoval] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rows = visibleContextMenuNodes(tree, expanded);
  const { rootRef, select } = useTreeFocus(props, editing?.key);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing?.key]);

  const apply = (next: ContextMenuTree, focusKey = selectedKey) => {
    if (next === tree) return;
    onChange(next);
    const nextKey =
      focusKey && findContextMenuNode(next, focusKey)
        ? focusKey
        : visibleContextMenuNodes(next, expanded)[0]?.key;
    if (nextKey) select(nextKey);
    else onSelect(null);
  };
  const toggleExpanded = (id: string) => {
    const result = toggleTreeSection(tree, id, expanded, selectedKey);
    if (result.focusKey) select(result.focusKey);
    onExpanded(result.expanded);
  };
  const removeNode = (key: string) => {
    const { next, focusKey } = removeWithNeighbor(tree, key, expanded);
    apply(next, focusKey);
  };
  const requestRemove = (key: string) => {
    if (findContextMenuNode(tree, key)?.type === 'section') setPendingSectionRemoval(key);
    else removeNode(key);
  };
  const commitRename = () => {
    finishTreeRename({
      tree,
      editing,
      apply,
      remove: removeNode,
      select,
      close: () => setEditing(null),
    });
  };
  const addSection = () => {
    const result = createSectionAtSelection(tree, selectedKey);
    if (!result) return;
    if (result.parentId) onExpanded(new Set([...expanded, result.parentId]));
    apply(result.tree, result.key);
    setEditing({ key: result.key, value: '', isNew: true });
  };
  const { moveRelative, moveInside, moveOutside } = createTreeReorder({
    tree,
    locale,
    expanded,
    onExpanded,
    apply,
    onAnnounce,
  });
  const keyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    key: string,
    node: ContextMenuTreeNode
  ) => {
    handleTreeMutationKey(event, key, node, {
      rename: (item, value) => setEditing({ key: item, value, isNew: false }),
      moveRelative,
      moveInside,
      moveOutside,
      remove: requestRemove,
      navigate: () =>
        handleTreeKey(event, key, node, { rows, expanded, tree, toggleExpanded, select }),
    });
  };
  const rowActions = {
    select: onSelect,
    toggleExpanded,
    keyDown,
    edit: (key: string, value: string) => setEditing({ key, value, isNew: false }),
    editValue: (value: string) => setEditing((current) => current && { ...current, value }),
    commitRename,
    cancelRename: (key: string) => {
      if (editing?.isNew) removeNode(key);
      setEditing(null);
      if (!editing?.isNew) select(key);
    },
    toggleEnabled: (key: string, enabled: boolean) =>
      apply(updateContextMenuNode(tree, key, { enabled }), key),
    moveRelative,
    moveInside,
    moveOutside,
    remove: requestRemove,
  };
  return {
    rootRef,
    inputRef,
    rows,
    editing,
    addSection,
    rowActions,
    pendingSectionRemoval,
    cancelSectionRemoval: () => setPendingSectionRemoval(null),
    confirmSectionRemoval: () => {
      if (pendingSectionRemoval) removeNode(pendingSectionRemoval);
      setPendingSectionRemoval(null);
    },
  };
}

export function ContextMenuTreeView(props: TreeViewProps) {
  const instructionsId = useId();
  const { tree, catalog, locale, selectedKey, expanded, drop } = props;
  const {
    rootRef,
    inputRef,
    rows,
    editing,
    addSection,
    rowActions,
    pendingSectionRemoval,
    cancelSectionRemoval,
    confirmSectionRemoval,
  } = useContextMenuTree(props);
  const t = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const dropRow = rows.find((row) => row.key === drop?.rowKey);
  let afterKey = dropRow?.key;
  if (drop?.edge === 'after' && dropRow) {
    const index = rows.indexOf(dropRow);
    for (let next = index + 1; next < rows.length; next += 1) {
      const descendant = rows[next];
      if (!descendant || descendant.level <= dropRow.level) break;
      afterKey = descendant.key;
    }
  }
  return (
    <div className="flex h-[min(28rem,55vh)] min-h-48 min-w-0 flex-col">
      <div
        className={[
          'flex h-12 shrink-0 items-center justify-between gap-2 border-b px-3',
          'border-[var(--sniptale-color-border-soft)]',
        ].join(' ')}
      >
        <h3 className="text-sm font-semibold">{t('settings.appearance.contextMenuTree')}</h3>
        {hasDisabledContextMenuSection(tree.nodes) ? (
          <button
            type="button"
            className={`${treeIconButton} w-auto px-2`}
            onClick={() => props.onChange(restoreContextMenuSections(tree))}
          >
            {t('settings.appearance.contextMenuRestoreHiddenSections')}
          </button>
        ) : null}
        <button
          type="button"
          className={`${settingsAddButtonClassName} !w-auto gap-1.5`}
          onClick={addSection}
          disabled={countContextMenuSections(tree.nodes) >= CONTEXT_MENU_MAX_SECTIONS}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {t('settings.appearance.contextMenuCreateSection')}
        </button>
      </div>
      <span id={instructionsId} className="sr-only">
        {t('settings.appearance.contextMenuMoveHelp')}
      </span>
      <div
        ref={rootRef}
        role="tree"
        aria-label={t('settings.appearance.contextMenuTree')}
        aria-describedby={instructionsId}
        data-context-menu-tree
        data-context-menu-scroll
        className={[
          'min-h-0 flex-1 overflow-auto p-2',
          drop?.rowKey === 'root' ? 'ring-1 ring-inset ring-[var(--sniptale-color-accent)]' : '',
        ].join(' ')}
      >
        {rows.length === 0 ? (
          <p className="p-3 text-sm text-[var(--sniptale-color-text-muted)]">
            {t('settings.appearance.contextMenuEmptyTree')}
          </p>
        ) : null}
        {rows.map((row) => {
          const { key, node } = row;
          const label =
            node.type === 'section'
              ? contextMenuSectionTitle(node.id, node.title, locale) ||
                t('settings.appearance.contextMenuNewSection')
              : contextMenuCommandLabel(node, catalog, locale);
          const unavailable =
            node.type === 'command' &&
            !catalog.find((item) => item.command === node.command)?.available;
          return (
            <ContextMenuTreeRow
              key={key}
              row={row}
              label={label}
              selected={selectedKey === key}
              first={!selectedKey && rows[0]?.key === key}
              expanded={node.type === 'section' && expanded.has(node.id)}
              dropEdge={
                drop?.edge === 'after'
                  ? afterKey === key
                    ? 'after'
                    : undefined
                  : drop?.rowKey === key
                    ? drop.edge
                    : undefined
              }
              dropIndent={dropRow ? (row.level - dropRow.level) * 18 : 0}
              {...(drop ? { dropTargetKey: drop.rowKey } : {})}
              unavailable={unavailable}
              editingValue={editing?.key === key ? editing.value : undefined}
              inputRef={inputRef}
              locale={locale}
              actions={rowActions}
            />
          );
        })}
      </div>
      {pendingSectionRemoval ? (
        <ProductConfirmDialog
          title={t('settings.appearance.contextMenuRemoveSection')}
          message={t('settings.appearance.contextMenuSectionRemovalMessage')}
          cancelText={t('common.actions.cancel')}
          confirmText={t('common.actions.delete')}
          onCancel={cancelSectionRemoval}
          onConfirm={confirmSectionRemoval}
        />
      ) : null}
    </div>
  );
}
