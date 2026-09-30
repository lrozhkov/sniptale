import type { KeyboardEvent } from 'react';
import type { AppLocale } from '../../../../../platform/i18n';
import { translate } from '../../../../../platform/i18n';
import type {
  ContextMenuTree,
  ContextMenuTreeNode,
} from '../../../../../contracts/settings/context-menu-layout';
import {
  addContextMenuSection,
  contextMenuNodePosition,
  findContextMenuNode,
  isContextMenuDescendant,
  moveContextMenuNode,
  updateContextMenuNode,
} from './context-menu-tree-model';

export function handleTreeMutationKey(
  event: KeyboardEvent<HTMLDivElement>,
  key: string,
  node: ContextMenuTreeNode,
  actions: {
    rename(key: string, value: string): void;
    moveRelative(key: string, offset: number): void;
    moveInside(key: string): void;
    moveOutside(key: string): void;
    remove(key: string): void;
    navigate(): void;
  }
) {
  if (event.target === event.currentTarget && event.key === 'F2') {
    event.preventDefault();
    actions.rename(key, node.title ?? '');
    return;
  }
  if (event.target === event.currentTarget && event.altKey) {
    const operation = {
      ArrowUp: () => actions.moveRelative(key, -1),
      ArrowDown: () => actions.moveRelative(key, 1),
      ArrowRight: () => actions.moveInside(key),
      ArrowLeft: () => actions.moveOutside(key),
    }[event.key];
    if (operation) {
      event.preventDefault();
      operation();
      return;
    }
  }
  if (event.target === event.currentTarget && event.key === 'Delete') {
    event.preventDefault();
    actions.remove(key);
    return;
  }
  actions.navigate();
}

export function finishTreeRename({
  tree,
  editing,
  apply,
  remove,
  select,
  close,
}: {
  tree: ContextMenuTree;
  editing: { key: string; value: string; isNew: boolean } | null;
  apply(next: ContextMenuTree, key: string): void;
  remove(key: string): void;
  select(key: string): void;
  close(): void;
}) {
  if (!editing) return;
  const value = editing.value.trim();
  if (value) apply(updateContextMenuNode(tree, editing.key, { title: value }), editing.key);
  else if (editing.isNew) remove(editing.key);
  else if (editing.key.startsWith('command:'))
    apply(updateContextMenuNode(tree, editing.key, { title: '' }), editing.key);
  close();
  if (!editing.isNew) select(editing.key);
}

export function toggleTreeSection(
  tree: ContextMenuTree,
  id: string,
  expanded: ReadonlySet<string>,
  selectedKey: string | null
) {
  const next = new Set(expanded);
  const closing = next.delete(id);
  if (!closing) next.add(id);
  return {
    expanded: next,
    focusKey:
      closing && selectedKey && isContextMenuDescendant(tree, selectedKey, id)
        ? `section:${id}`
        : null,
  };
}

export function createSectionAtSelection(tree: ContextMenuTree, selectedKey: string | null) {
  const position = selectedKey ? contextMenuNodePosition(tree, selectedKey) : null;
  const selected = selectedKey ? findContextMenuNode(tree, selectedKey) : null;
  const parentId = selected?.type === 'section' ? selected.id : (position?.parentId ?? null);
  const index =
    selected?.type === 'section'
      ? selected.children.length
      : position
        ? position.index + 1
        : tree.nodes.length;
  const result = addContextMenuSection(tree, index, parentId);
  return result && { ...result, parentId };
}

/** Reorder commands and whole sections through the same pure tree move operation. */
export function createTreeReorder({
  tree,
  locale,
  expanded,
  onExpanded,
  apply,
  onAnnounce,
}: {
  tree: ContextMenuTree;
  locale: AppLocale;
  expanded: ReadonlySet<string>;
  onExpanded(next: Set<string>): void;
  apply(next: ContextMenuTree, key: string): void;
  onAnnounce(message: string): void;
}) {
  const moveRelative = (key: string, offset: number) => {
    const position = contextMenuNodePosition(tree, key);
    if (!position) return;
    const nextIndex = offset < 0 ? position.index - 1 : position.index + 2;
    const next = moveContextMenuNode(tree, key, { parentId: position.parentId, index: nextIndex });
    apply(next, key);
    if (next !== tree)
      onAnnounce(
        offset < 0
          ? translate('settings.appearance.contextMenuUp', locale)
          : translate('settings.appearance.contextMenuDown', locale)
      );
  };
  const moveInside = (key: string) => {
    const position = contextMenuNodePosition(tree, key);
    if (!position) return;
    const parent = position.parentId
      ? findContextMenuNode(tree, `section:${position.parentId}`)
      : null;
    const siblings = parent?.type === 'section' ? parent.children : tree.nodes;
    const nearby = siblings
      .slice(0, position.index)
      .reverse()
      .find((node) => node.type === 'section');
    if (nearby?.type !== 'section') return;
    const next = moveContextMenuNode(tree, key, {
      parentId: nearby.id,
      index: nearby.children.length,
    });
    onExpanded(new Set([...expanded, nearby.id]));
    apply(next, key);
    if (next !== tree)
      onAnnounce(`${translate('settings.appearance.contextMenuInside', locale)}: ${nearby.title}`);
  };
  const moveOutside = (key: string) => {
    const position = contextMenuNodePosition(tree, key);
    if (!position?.parentId) return;
    const parentPosition = contextMenuNodePosition(tree, `section:${position.parentId}`);
    if (!parentPosition) return;
    const next = moveContextMenuNode(tree, key, {
      parentId: parentPosition.parentId,
      index: parentPosition.index + 1,
    });
    apply(next, key);
    if (next !== tree) onAnnounce(translate('settings.appearance.contextMenuOutside', locale));
  };
  return { moveRelative, moveInside, moveOutside };
}
