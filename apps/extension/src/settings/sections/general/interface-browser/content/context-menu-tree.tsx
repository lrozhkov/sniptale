import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { Folder } from 'lucide-react';
import type { AppLocale } from '../../../../../platform/i18n';
import { translate } from '../../../../../platform/i18n';
import type {
  ContextMenuTree,
  ContextMenuTreeNode,
} from '../../../../../contracts/settings/context-menu-layout';
import type { ContextMenuCatalogItem } from './context-menu-catalog';
import { contextMenuCommandLabel } from './context-menu-catalog';
import { ContextMenuTreeRow, treeIconButton } from './context-menu-tree-row';
import {
  addContextMenuSection,
  contextMenuNodeKey,
  contextMenuNodePosition,
  findContextMenuNode,
  moveContextMenuNode,
  removeContextMenuNode,
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
    apply(next: ContextMenuTree, focusKey: string): void;
    select(key: string): void;
  }
) {
  const { rows, expanded, tree, toggleExpanded, apply, select } = context;
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
        else nextKey = node.children[0] ? contextMenuNodeKey(node.children[0]) : undefined;
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
      else apply(updateContextMenuNode(tree, key, { enabled: !node.enabled }), key);
      break;
    default:
      return;
  }
  event.preventDefault();
  if (nextKey) select(nextKey);
}

/** Pointer drop targets are resolved against the same pure move operation as row controls. */
function useTreeDrop(
  props: Pick<TreeViewProps, 'tree' | 'locale' | 'expanded' | 'onExpanded' | 'onAnnounce'> & {
    apply(next: ContextMenuTree, focusKey: string): void;
  }
) {
  const { tree, locale, expanded, onExpanded, onAnnounce, apply } = props;
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
    if (!dragKey.current) return;
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
    const possible = moveContextMenuNode(tree, dragKey.current, target);
    event.dataTransfer.dropEffect = possible === tree ? 'none' : 'move';
    setDrop(possible === tree ? null : target);
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
      if (dragKey.current && drop) {
        const next = moveContextMenuNode(tree, dragKey.current, drop);
        if (next !== tree && drop.parentId) onExpanded(new Set([...expanded, drop.parentId]));
        apply(next, dragKey.current);
        if (next !== tree) onAnnounce(t('settings.appearance.contextMenuMoved'));
      }
      dragEnd();
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
  const { tree, locale, selectedKey, onSelect, onChange, expanded, onExpanded, onAnnounce } = props;
  const [editing, setEditing] = useState<{ key: string; value: string; isNew: boolean } | null>(
    null
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const rows = visibleContextMenuNodes(tree, expanded);
  const t = (key: Parameters<typeof translate>[0]) => translate(key, locale);
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
  const drag = useTreeDrop({ tree, locale, expanded, onExpanded, onAnnounce, apply });
  const toggleExpanded = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) {
      next.delete(id);
      if (selectedKey && contextMenuNodePosition(tree, selectedKey)?.parentId === id)
        select(`section:${id}`);
    } else next.add(id);
    onExpanded(next);
  };
  const removeNode = (key: string) => {
    const { next, focusKey } = removeWithNeighbor(tree, key, expanded);
    apply(next, focusKey);
  };
  const commitRename = () => {
    if (!editing) return;
    const value = editing.value.trim();
    if (value) apply(updateContextMenuNode(tree, editing.key, { title: value }), editing.key);
    else if (editing.isNew) removeNode(editing.key);
    else if (editing.key.startsWith('command:'))
      apply(updateContextMenuNode(tree, editing.key, { title: '' }), editing.key);
    setEditing(null);
    if (!editing.isNew) select(editing.key);
  };
  const addSection = () => {
    const position = selectedKey ? contextMenuNodePosition(tree, selectedKey) : null;
    const rootIndex = position?.parentId
      ? tree.nodes.findIndex((node) => node.type === 'section' && node.id === position.parentId) + 1
      : position
        ? position.index + 1
        : tree.nodes.length;
    const result = addContextMenuSection(tree, rootIndex);
    if (!result) return;
    apply(result.tree, result.key);
    setEditing({ key: result.key, value: '', isNew: true });
  };
  const moveRelative = (key: string, offset: number) => {
    const position = contextMenuNodePosition(tree, key);
    if (!position) return;
    const nextIndex = offset < 0 ? position.index - 1 : position.index + 2;
    const next = moveContextMenuNode(tree, key, { parentId: position.parentId, index: nextIndex });
    apply(next, key);
    if (next !== tree)
      onAnnounce(
        offset < 0
          ? t('settings.appearance.contextMenuUp')
          : t('settings.appearance.contextMenuDown')
      );
  };
  const moveInside = (key: string) => {
    const position = contextMenuNodePosition(tree, key);
    if (!position || position.parentId || key.startsWith('section:')) return;
    const nearby = [
      ...tree.nodes.slice(0, position.index).reverse(),
      ...tree.nodes.slice(position.index + 1),
    ].find((node) => node.type === 'section');
    if (nearby?.type !== 'section') return;
    const next = moveContextMenuNode(tree, key, {
      parentId: nearby.id,
      index: nearby.children.length,
    });
    onExpanded(new Set([...expanded, nearby.id]));
    apply(next, key);
    if (next !== tree) onAnnounce(`${t('settings.appearance.contextMenuInside')}: ${nearby.title}`);
  };
  const moveOutside = (key: string) => {
    const position = contextMenuNodePosition(tree, key);
    if (!position?.parentId) return;
    const sectionIndex = tree.nodes.findIndex(
      (node) => node.type === 'section' && node.id === position.parentId
    );
    const next = moveContextMenuNode(tree, key, { parentId: null, index: sectionIndex + 1 });
    apply(next, key);
    if (next !== tree) onAnnounce(t('settings.appearance.contextMenuOutside'));
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>, key: string, node: ContextMenuTreeNode) =>
    handleTreeKey(event, key, node, { rows, expanded, tree, toggleExpanded, apply, select });
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
    remove: removeNode,
  };
  return { rootRef, inputRef, rows, drop: drag.drop, editing, addSection, rowActions };
}

export function ContextMenuTreeView(props: TreeViewProps) {
  const { tree, catalog, locale, selectedKey, expanded } = props;
  const { rootRef, inputRef, rows, drop, editing, addSection, rowActions } =
    useContextMenuTree(props);
  const t = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t('settings.appearance.contextMenuTree')}</h3>
        <button
          type="button"
          className={`${treeIconButton} w-auto gap-1 px-2`}
          onClick={addSection}
          disabled={tree.nodes.filter((node) => node.type === 'section').length >= 9}
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
        className={[
          'max-h-[34rem] min-h-20 space-y-1 overflow-y-auto rounded-xl border',
          'border-[var(--sniptale-color-border-soft)]',
          'bg-[var(--sniptale-color-surface-canvas)] p-2',
        ].join(' ')}
      >
        {rows.length === 0 ? (
          <p className="p-3 text-sm text-[var(--sniptale-color-text-muted)]">
            {t('settings.appearance.contextMenuEmptyTree')}
          </p>
        ) : null}
        {rows.map((row) => {
          const { key, node, parentId } = row;
          const label =
            node.type === 'section'
              ? node.title || t('settings.appearance.contextMenuNewSection')
              : contextMenuCommandLabel(node, catalog, locale);
          const position = contextMenuNodePosition(tree, key)!;
          const parent = parentId
            ? tree.nodes.find((entry) => entry.type === 'section' && entry.id === parentId)
            : null;
          const siblingCount =
            parent?.type === 'section' ? parent.children.length : tree.nodes.length;
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
              siblingIndex={position.index}
              siblingCount={siblingCount}
              hasSections={tree.nodes.some((entry) => entry.type === 'section')}
              locale={locale}
              actions={rowActions}
            />
          );
        })}
      </div>
    </div>
  );
}
