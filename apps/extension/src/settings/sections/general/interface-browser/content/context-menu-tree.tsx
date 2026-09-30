import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { Folder } from 'lucide-react';
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
import {
  createSectionAtSelection,
  createTreeReorder,
  finishTreeRename,
  handleTreeMutationKey,
  toggleTreeSection,
} from './context-menu-tree-controller';
import {
  addContextMenuCommand,
  contextMenuNodePosition,
  countContextMenuSections,
  findContextMenuNode,
  hasDisabledContextMenuSection,
  moveContextMenuNode,
  removeContextMenuNode,
  restoreContextMenuSections,
  updateContextMenuNode,
  visibleContextMenuNodes,
} from './context-menu-tree-model';

type DropTarget = {
  parentId: string | null;
  index: number;
  rowKey: string;
  edge: 'before' | 'after' | 'inside';
};
type TreeViewProps = {
  tree: ContextMenuTree;
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

/** Pointer drop targets are resolved against the same pure move operation as row controls. */
function useTreeDrop(
  props: Pick<
    TreeViewProps,
    'tree' | 'catalog' | 'locale' | 'expanded' | 'onExpanded' | 'onAnnounce'
  > & {
    apply(next: ContextMenuTree, focusKey: string): void;
  }
) {
  const { tree, catalog, locale, expanded, onExpanded, onAnnounce, apply } = props;
  const dragKey = useRef<string | null>(null);
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const t = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  useEffect(
    () => () => {
      if (expandTimer.current) clearTimeout(expandTimer.current);
    },
    []
  );
  const clearExpandTimer = () => {
    if (expandTimer.current) clearTimeout(expandTimer.current);
    expandTimer.current = null;
  };
  const dragOver = (
    event: DragEvent<HTMLDivElement>,
    rowKey: string,
    node: ContextMenuTreeNode
  ) => {
    const external = event.dataTransfer.types?.includes('text/plain') ?? false;
    if (!dragKey.current && !external) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const inside = node.type === 'section' && event.clientX > rect.left + 54;
    const edge = inside
      ? 'inside'
      : event.clientY < rect.top + rect.height / 2
        ? 'before'
        : 'after';
    const position = contextMenuNodePosition(tree, rowKey)!;
    const target: DropTarget = inside
      ? {
          parentId: node.type === 'section' ? node.id : null,
          index: node.type === 'section' ? node.children.length : 0,
          rowKey,
          edge,
        }
      : {
          parentId: position.parentId,
          index: position.index + (edge === 'after' ? 1 : 0),
          rowKey,
          edge,
        };
    const possible = dragKey.current ? moveContextMenuNode(tree, dragKey.current, target) : tree;
    event.dataTransfer.dropEffect = possible === tree ? 'none' : 'move';
    setDrop(dragKey.current && possible === tree ? null : target);
    if (inside && node.type === 'section' && !expanded.has(node.id) && !expandTimer.current) {
      expandTimer.current = setTimeout(() => {
        onExpanded(new Set([...expanded, node.id]));
        expandTimer.current = null;
      }, 450);
    } else if (!inside) clearExpandTimer();
  };
  const dragEnd = () => {
    dragKey.current = null;
    setDrop(null);
    clearExpandTimer();
  };
  return {
    drop,
    dragStart: (event: DragEvent<HTMLSpanElement>, key: string) => {
      dragKey.current = key;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', key);
    },
    dragEnd,
    dragOver,
    dropOnRow: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const external = event.dataTransfer.getData?.('text/plain') ?? '';
      const command = external.startsWith('command:') ? external.slice('command:'.length) : null;
      if (
        drop &&
        (dragKey.current ||
          (command && catalog.some((item) => item.command === command && item.available)))
      ) {
        const next = dragKey.current
          ? moveContextMenuNode(tree, dragKey.current, drop)
          : addContextMenuCommand(tree, command!, drop);
        if (next !== tree && drop.parentId) onExpanded(new Set([...expanded, drop.parentId]));
        apply(next, dragKey.current ?? external);
        if (next !== tree) onAnnounce(t('settings.appearance.contextMenuMoved'));
      }
      dragEnd();
    },
    rootDragOver: (event: DragEvent<HTMLDivElement>) => {
      if ((event.target as HTMLElement).closest('[role="treeitem"]')) return;
      if (!dragKey.current && !event.dataTransfer.types?.includes('text/plain')) return;
      event.preventDefault();
      setDrop({ parentId: null, index: tree.nodes.length, rowKey: 'root', edge: 'inside' });
    },
  };
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
  const {
    tree,
    catalog,
    locale,
    selectedKey,
    onSelect,
    onChange,
    expanded,
    onExpanded,
    onAnnounce,
  } = props;
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
  const drag = useTreeDrop({ tree, catalog, locale, expanded, onExpanded, onAnnounce, apply });
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
    dragStart: drag.dragStart,
    dragEnd: drag.dragEnd,
    dragOver: drag.dragOver,
    drop: drag.dropOnRow,
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
    drop: drag.drop,
    rootDragOver: drag.rootDragOver,
    rootDrop: drag.dropOnRow,
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
  const { tree, catalog, locale, selectedKey, expanded } = props;
  const {
    rootRef,
    inputRef,
    rows,
    drop,
    rootDragOver,
    rootDrop,
    editing,
    addSection,
    rowActions,
    pendingSectionRemoval,
    cancelSectionRemoval,
    confirmSectionRemoval,
  } = useContextMenuTree(props);
  const t = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
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
          className={`${treeIconButton} w-auto gap-1 px-2`}
          onClick={addSection}
          disabled={countContextMenuSections(tree.nodes) >= CONTEXT_MENU_MAX_SECTIONS}
        >
          <Folder size={15} />
          {t('settings.appearance.contextMenuCreateSection')}
        </button>
      </div>
      <p className="text-xs text-[var(--sniptale-color-text-muted)]">
        {t('settings.appearance.contextMenuMoveHelp')}
      </p>
      <div
        ref={rootRef}
        role="tree"
        aria-label={t('settings.appearance.contextMenuTree')}
        onDragOver={rootDragOver}
        onDrop={rootDrop}
        className={[
          'max-h-[34rem] min-h-20 space-y-1 overflow-auto rounded-xl border',
          'border-[var(--sniptale-color-border-soft)]',
          'bg-[var(--sniptale-color-surface-canvas)] p-2',
          drop?.rowKey === 'root' ? 'ring-2 ring-[var(--sniptale-color-accent)]' : '',
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
              dropEdge={drop?.rowKey === key ? drop.edge : undefined}
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
