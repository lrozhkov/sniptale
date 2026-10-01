import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import type {
  ContextMenuTree,
  ContextMenuTreeNode,
} from '../../../../../contracts/settings/context-menu-layout';
import { translate, type AppLocale } from '../../../../../platform/i18n';
import type { ContextMenuCatalogItem } from './context-menu-catalog';
import {
  addContextMenuCommand,
  contextMenuNodePosition,
  findContextMenuNode,
  moveContextMenuNode,
} from './context-menu-tree-model';

type DropTarget = {
  parentId: string | null;
  index: number;
  rowKey: string;
  edge: 'before' | 'after' | 'inside';
};

function rowTarget(
  tree: ContextMenuTree,
  rowKey: string,
  node: ContextMenuTreeNode,
  rect: DOMRect,
  x: number,
  y: number
): DropTarget | null {
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

function useTreeDragCancellation(dragEnd: () => void, clearExpandTimer: () => void) {
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dragEnd();
    };
    // Catalog drags can end outside the tree, where its internal handles receive no dragend.
    window.addEventListener('dragend', dragEnd, true);
    window.addEventListener('keydown', cancel, true);
    return () => {
      window.removeEventListener('dragend', dragEnd, true);
      window.removeEventListener('keydown', cancel, true);
      clearExpandTimer();
    };
  }, [clearExpandTimer, dragEnd]);
}

/** One disposable native drag session owns the indicator, expansion timer and tree commit. */
export function useContextMenuTreeDrop(props: {
  tree: ContextMenuTree;
  catalog: readonly ContextMenuCatalogItem[];
  locale: AppLocale;
  expanded: ReadonlySet<string>;
  onExpanded(next: Set<string>): void;
  onAnnounce(message: string): void;
  apply(next: ContextMenuTree, focusKey: string): void;
}) {
  const { tree, catalog, locale, expanded, onExpanded, onAnnounce, apply } = props;
  const dragKey = useRef<string | null>(null);
  const latestTarget = useRef<DropTarget | null>(null);
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandingSection = useRef<string | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const clearExpandTimer = useCallback(() => {
    if (expandTimer.current) clearTimeout(expandTimer.current);
    expandTimer.current = null;
    expandingSection.current = null;
  }, []);
  const setTarget = (target: DropTarget | null) => {
    latestTarget.current = target;
    setDrop(target);
  };
  const dragEnd = useCallback(() => {
    dragKey.current = null;
    latestTarget.current = null;
    setDrop(null);
    clearExpandTimer();
  }, [clearExpandTimer]);
  useTreeDragCancellation(dragEnd, clearExpandTimer);
  const dragOver = (
    event: DragEvent<HTMLDivElement>,
    rowKey: string,
    node: ContextMenuTreeNode
  ) => {
    if (!dragKey.current && !event.dataTransfer.types.includes('text/plain')) return;
    event.preventDefault();
    event.stopPropagation();
    const target = rowTarget(
      tree,
      rowKey,
      node,
      event.currentTarget.getBoundingClientRect(),
      event.clientX,
      event.clientY
    );
    const valid =
      target && (!dragKey.current || moveContextMenuNode(tree, dragKey.current, target) !== tree);
    event.dataTransfer.dropEffect = valid ? 'move' : 'none';
    setTarget(valid ? target : null);
    const section = valid && target.edge === 'inside' && node.type === 'section' ? node.id : null;
    if (section !== expandingSection.current) clearExpandTimer();
    if (section && !expanded.has(section) && !expandTimer.current) {
      expandingSection.current = section;
      expandTimer.current = setTimeout(() => {
        onExpanded(new Set([...expanded, section]));
        clearExpandTimer();
      }, 450);
    }
  };
  const dropOnRow = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    let target = latestTarget.current;
    if (!target) {
      dragEnd();
      return;
    }
    const rowKey = event.currentTarget.dataset['treeKey'];
    const node = rowKey ? findContextMenuNode(tree, rowKey) : null;
    if (node && rowKey && typeof event.clientX === 'number' && typeof event.clientY === 'number') {
      target = rowTarget(
        tree,
        rowKey,
        node,
        event.currentTarget.getBoundingClientRect(),
        event.clientX,
        event.clientY
      );
    } else if (target?.rowKey !== (rowKey ?? 'root')) target = null;
    const payload = event.dataTransfer.getData('text/plain');
    const command = payload.startsWith('command:') ? payload.slice('command:'.length) : null;
    if (
      target &&
      (dragKey.current ||
        (command && catalog.some((item) => item.command === command && item.available)))
    ) {
      const next = dragKey.current
        ? moveContextMenuNode(tree, dragKey.current, target)
        : command
          ? addContextMenuCommand(tree, command, target)
          : tree;
      if (next !== tree) {
        if (target.parentId) onExpanded(new Set([...expanded, target.parentId]));
        apply(next, dragKey.current ?? payload);
        onAnnounce(translate('settings.appearance.contextMenuMoved', locale));
      }
    }
    dragEnd();
  };
  return {
    drop,
    dragEnd,
    dragOver,
    dropOnRow,
    dragStart: (event: DragEvent<HTMLSpanElement>, key: string) => {
      dragKey.current = key;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', key);
    },
    rootDragOver: (event: DragEvent<HTMLDivElement>) => {
      if (event.target instanceof Element && event.target.closest('[role="treeitem"]')) return;
      if (!dragKey.current && !event.dataTransfer.types.includes('text/plain')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      clearExpandTimer();
      setTarget({ parentId: null, index: tree.nodes.length, rowKey: 'root', edge: 'inside' });
    },
    rootDragLeave: (event: DragEvent<HTMLDivElement>) => {
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))
        return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (
        event.clientX >= rect.left &&
        event.clientX < rect.right &&
        event.clientY >= rect.top &&
        event.clientY < rect.bottom
      )
        return;
      setTarget(null);
      clearExpandTimer();
    },
  };
}
