import { useEffect, useRef, useState } from 'react';
import type {
  ContextMenuTree,
  ContextMenuTreeNode,
} from '../../../../../contracts/settings/context-menu-layout';
import { translate, type AppLocale } from '../../../../../platform/i18n';
import type { ContextMenuCatalogItem } from './context-menu-catalog';
import { bindContextMenuPointerDrag } from './context-menu-pointer-drag';
import {
  addContextMenuCommand,
  contextMenuNodePosition,
  findContextMenuNode,
  isContextMenuCommandActive,
  isContextMenuDescendant,
  moveContextMenuNode,
} from './context-menu-tree-model';

/** Accepted placement shared by pointer targeting and the tree's insertion indicator. */
export type ContextMenuDropTarget = {
  parentId: string | null;
  index: number;
  rowKey: string;
  edge: 'before' | 'after' | 'inside';
};
type Source = { key: string; origin: 'tree' | 'catalog' };
type Target = ContextMenuDropTarget | 'catalog' | null;
type DropProps = {
  tree: ContextMenuTree | null;
  catalog: readonly ContextMenuCatalogItem[];
  locale: AppLocale;
  expanded: ReadonlySet<string>;
  onExpanded(next: Set<string>): void;
  onAnnounce(message: string): void;
  apply(next: ContextMenuTree, focusKey: string): void;
  remove(key: string): void;
};

function rowTarget(
  tree: ContextMenuTree,
  rowKey: string,
  node: ContextMenuTreeNode,
  rect: DOMRect,
  x: number,
  y: number
): ContextMenuDropTarget | null {
  const position = contextMenuNodePosition(tree, rowKey);
  if (!position) return null;
  const middle = y >= rect.top + rect.height * 0.25 && y <= rect.bottom - rect.height * 0.25;
  const inside = node.type === 'section' && middle && x > rect.left + 54;
  const edge = inside ? 'inside' : y < rect.top + rect.height / 2 ? 'before' : 'after';
  return inside && node.type === 'section'
    ? { parentId: node.id, index: node.children.length, rowKey, edge }
    : {
        parentId: position.parentId,
        index: position.index + (edge === 'after' ? 1 : 0),
        rowKey,
        edge,
      };
}

function resolveTarget(
  tree: ContextMenuTree,
  source: Source,
  hit: Element | null,
  x: number,
  y: number
): Target {
  if (hit?.closest('[data-context-menu-catalog]'))
    return source.origin === 'tree' ? 'catalog' : null;
  if (!hit?.closest('[data-context-menu-tree]')) return null;
  const row = hit.closest<HTMLElement>('[data-tree-key]');
  const key = row?.dataset['treeKey'];
  const node = key ? findContextMenuNode(tree, key) : null;
  const target =
    row && key && node
      ? rowTarget(tree, key, node, row.getBoundingClientRect(), x, y)
      : { parentId: null, index: tree.nodes.length, rowKey: 'root', edge: 'inside' as const };
  if (!target || source.origin === 'catalog') return target;
  const moving = findContextMenuNode(tree, source.key);
  if (!moving) return null;
  if (
    moving.type === 'section' &&
    target.parentId &&
    (target.parentId === moving.id ||
      isContextMenuDescendant(tree, `section:${target.parentId}`, moving.id))
  )
    return null;
  const position = contextMenuNodePosition(tree, source.key);
  if (
    position?.parentId === target.parentId &&
    (target.index === position.index || target.index === position.index + 1)
  )
    return null;
  return target;
}

function acceptedSource(props: DropProps, source: Source) {
  if (!props.tree) return false;
  if (source.origin === 'tree') return !!findContextMenuNode(props.tree, source.key);
  const command = source.key.slice('command:'.length);
  return (
    source.key.startsWith('command:') &&
    props.catalog.some((item) => item.command === command && item.available) &&
    !isContextMenuCommandActive(props.tree, command)
  );
}

/** Owns a workspace drag target and delayed expansion; commit uses the current draft owner. */
export function useContextMenuTreeDrop(props: DropProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  current.current = props;
  const [target, setTarget] = useState<Target>(null);
  // Saving can replace the draft object without changing a gesture's source or destinations.
  const treeIdentity = props.tree ? JSON.stringify(props.tree) : null;
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !current.current.tree) return;
    let latest: Target = null;
    let expanding: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clearTimer = () => {
      clearTimeout(timer);
      timer = undefined;
      expanding = null;
    };
    const set = (next: Target) => {
      if (JSON.stringify(latest) === JSON.stringify(next)) return;
      latest = next;
      setTarget(next);
    };
    const cleanup = bindContextMenuPointerDrag(root, {
      accept: (source) => acceptedSource(current.current, source),
      move: (source, hit, x, y) => {
        const state = current.current;
        const next = state.tree ? resolveTarget(state.tree, source, hit, x, y) : null;
        set(next);
        const section = next && next !== 'catalog' && next.edge === 'inside' ? next.parentId : null;
        if (section !== expanding) clearTimer();
        if (section && !state.expanded.has(section) && !timer) {
          expanding = section;
          timer = setTimeout(() => {
            current.current.onExpanded(new Set([...current.current.expanded, section]));
            clearTimer();
          }, 450);
        }
      },
      commit: (source) => {
        const state = current.current;
        if (!state.tree || !latest || !acceptedSource(state, source)) return;
        if (latest === 'catalog') {
          root
            .querySelector<HTMLElement>('[data-context-menu-catalog]')
            ?.focus({ preventScroll: true });
          state.remove(source.key);
          return;
        }
        const next =
          source.origin === 'tree'
            ? moveContextMenuNode(state.tree, source.key, latest)
            : addContextMenuCommand(state.tree, source.key.slice('command:'.length), latest);
        if (next === state.tree) return;
        if (latest.parentId) state.onExpanded(new Set([...state.expanded, latest.parentId]));
        state.apply(next, source.key);
        state.onAnnounce(translate('settings.appearance.contextMenuMoved', state.locale));
      },
      end: () => {
        set(null);
        clearTimer();
      },
    });
    return () => {
      cleanup();
      clearTimer();
    };
  }, [treeIdentity]);
  return {
    rootRef,
    drop: target === 'catalog' ? null : target,
    catalogTarget: target === 'catalog',
  };
}
