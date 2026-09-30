import type {
  ContextMenuCommandNode,
  ContextMenuTree,
  ContextMenuTreeNode,
} from '../../../../../contracts/settings/context-menu-layout';
import { CONTEXT_MENU_MAX_SECTIONS } from '../../../../../contracts/settings/context-menu-layout';

type Position = { parentId: string | null; index: number };

export function countContextMenuSections(nodes: ContextMenuTreeNode[]): number {
  return nodes.reduce(
    (count, node) =>
      count + (node.type === 'section' ? 1 + countContextMenuSections(node.children) : 0),
    0
  );
}

export function hasDisabledContextMenuSection(nodes: ContextMenuTreeNode[]): boolean {
  return nodes.some(
    (node) =>
      node.type === 'section' && (!node.enabled || hasDisabledContextMenuSection(node.children))
  );
}

export function restoreContextMenuSections(tree: ContextMenuTree): ContextMenuTree {
  if (!hasDisabledContextMenuSection(tree.nodes)) return tree;
  const next = structuredClone(tree);
  const pending = [...next.nodes];
  while (pending.length) {
    const node = pending.pop()!;
    if (node.type !== 'section') continue;
    node.enabled = true;
    pending.push(...node.children);
  }
  return next;
}

export function isContextMenuDescendant(
  tree: ContextMenuTree,
  key: string,
  ancestorId: string
): boolean {
  let parentId = contextMenuNodePosition(tree, key)?.parentId;
  while (parentId) {
    if (parentId === ancestorId) return true;
    parentId = contextMenuNodePosition(tree, `section:${parentId}`)?.parentId ?? null;
  }
  return false;
}

function contextMenuNodeKey(node: ContextMenuTreeNode): string {
  return node.type === 'section' ? `section:${node.id}` : `command:${node.command}`;
}

export function findContextMenuNode(
  tree: ContextMenuTree,
  key: string
): ContextMenuTreeNode | null {
  const pending = [...tree.nodes];
  while (pending.length) {
    const node = pending.pop()!;
    if (contextMenuNodeKey(node) === key) return node;
    if (node.type === 'section') pending.push(...node.children);
  }
  return null;
}

export function contextMenuNodePosition(tree: ContextMenuTree, key: string): Position | null {
  const pending = [{ nodes: tree.nodes, parentId: null as string | null }];
  while (pending.length) {
    const { nodes, parentId } = pending.pop()!;
    for (const [index, node] of nodes.entries()) {
      if (contextMenuNodeKey(node) === key) return { parentId, index };
      if (node.type === 'section') pending.push({ nodes: node.children, parentId: node.id });
    }
  }
  return null;
}

function getItems(tree: ContextMenuTree, parentId: string | null): ContextMenuTreeNode[] | null {
  if (parentId === null) return tree.nodes;
  const section = findContextMenuNode(tree, `section:${parentId}`);
  return section?.type === 'section' ? section.children : null;
}

/** One pure operation for pointer and keyboard reordering; invalid drops keep the draft intact. */
export function moveContextMenuNode(
  tree: ContextMenuTree,
  key: string,
  destination: Position
): ContextMenuTree {
  const source = contextMenuNodePosition(tree, key);
  const node = findContextMenuNode(tree, key);
  const targetItems = getItems(tree, destination.parentId);
  if (!source || !node || !targetItems) return tree;
  if (node.type === 'section' && destination.parentId !== null) {
    const pending = [...node.children];
    if (destination.parentId === node.id) return tree;
    while (pending.length) {
      const descendant = pending.pop()!;
      if (descendant.type !== 'section') continue;
      if (descendant.id === destination.parentId) return tree;
      pending.push(...descendant.children);
    }
  }
  if (
    !Number.isInteger(destination.index) ||
    destination.index < 0 ||
    destination.index > targetItems.length
  )
    return tree;
  const next = structuredClone(tree);
  const sourceItems = getItems(next, source.parentId)!;
  const [moving] = sourceItems.splice(source.index, 1);
  if (!moving) return tree;
  const nextTarget = getItems(next, destination.parentId)!;
  const adjustedIndex =
    source.parentId === destination.parentId && source.index < destination.index
      ? destination.index - 1
      : destination.index;
  nextTarget.splice(adjustedIndex, 0, moving);
  return next;
}

export function addContextMenuSection(
  tree: ContextMenuTree,
  index: number,
  parentId: string | null = null
): {
  tree: ContextMenuTree;
  key: string;
} | null {
  const destination = getItems(tree, parentId);
  if (!destination || !Number.isInteger(index) || index < 0 || index > destination.length)
    return null;
  if (countContextMenuSections(tree.nodes) >= CONTEXT_MENU_MAX_SECTIONS) return null;
  let number = 1;
  while (findContextMenuNode(tree, `section:section-${number}`)) number += 1;
  const id = `section-${number}`;
  const next = structuredClone(tree);
  getItems(next, parentId)!.splice(index, 0, {
    type: 'section',
    id,
    title: '',
    enabled: true,
    children: [],
  });
  return { tree: next, key: `section:${id}` };
}

export function addContextMenuCommand(
  tree: ContextMenuTree,
  command: string,
  destination: Position
): ContextMenuTree {
  const existing = findContextMenuNode(tree, `command:${command}`);
  if (existing?.type === 'command' && isContextMenuCommandActive(tree, command)) return tree;
  if (
    destination.parentId &&
    !findContextMenuNode(tree, `section:${destination.parentId}`)?.enabled
  )
    return tree;
  const next = structuredClone(tree);
  const source = existing ? contextMenuNodePosition(next, `command:${command}`) : null;
  if (source) getItems(next, source.parentId)!.splice(source.index, 1);
  const target = getItems(next, destination.parentId);
  const adjustedIndex =
    source?.parentId === destination.parentId && source.index < destination.index
      ? destination.index - 1
      : destination.index;
  if (
    !target ||
    !Number.isInteger(adjustedIndex) ||
    adjustedIndex < 0 ||
    adjustedIndex > target.length
  )
    return tree;
  const commandNode: ContextMenuCommandNode =
    existing?.type === 'command'
      ? { ...existing, enabled: true }
      : { type: 'command', command, enabled: true };
  target.splice(adjustedIndex, 0, commandNode);
  return next;
}

/** Catalog activation restores retained placement and every disabled ancestor. */
export function reactivateContextMenuCommand(
  tree: ContextMenuTree,
  command: string
): ContextMenuTree {
  const key = `command:${command}`;
  if (!findContextMenuNode(tree, key) || isContextMenuCommandActive(tree, command)) return tree;
  const next = structuredClone(tree);
  const node = findContextMenuNode(next, key);
  if (node) node.enabled = true;
  let parentId = contextMenuNodePosition(next, key)?.parentId;
  while (parentId) {
    const section = findContextMenuNode(next, `section:${parentId}`);
    if (section) section.enabled = true;
    parentId = contextMenuNodePosition(next, `section:${parentId}`)?.parentId ?? null;
  }
  return next;
}

export function removeContextMenuNode(tree: ContextMenuTree, key: string): ContextMenuTree {
  const source = contextMenuNodePosition(tree, key);
  if (!source) return tree;
  const next = structuredClone(tree);
  const items = getItems(next, source.parentId)!;
  const [removed] = items.splice(source.index, 1);
  if (removed?.type === 'section') {
    const flatten = (children: ContextMenuTreeNode[], enabled: boolean): ContextMenuCommandNode[] =>
      children.flatMap((child) =>
        child.type === 'command'
          ? [{ ...child, enabled: child.enabled && enabled }]
          : flatten(child.children, enabled && child.enabled)
      );
    items.splice(source.index, 0, ...flatten(removed.children, removed.enabled));
  }
  return next;
}

export function updateContextMenuNode(
  tree: ContextMenuTree,
  key: string,
  patch: { enabled?: boolean; title?: string }
): ContextMenuTree {
  const next = structuredClone(tree);
  const node = findContextMenuNode(next, key);
  if (!node) return tree;
  if (patch.enabled !== undefined) node.enabled = patch.enabled;
  if (patch.title !== undefined) {
    if (node.type === 'command' && patch.title === '') delete node.title;
    else node.title = patch.title;
  }
  return next;
}

export function visibleContextMenuNodes(
  tree: ContextMenuTree,
  expanded: ReadonlySet<string>
): Array<{ key: string; node: ContextMenuTreeNode; level: number; parentId: string | null }> {
  const result: Array<{
    key: string;
    node: ContextMenuTreeNode;
    level: number;
    parentId: string | null;
  }> = [];
  const visit = (nodes: ContextMenuTreeNode[], parentId: string | null, level: number) => {
    for (const node of nodes) {
      if (!node.enabled) continue;
      result.push({ key: contextMenuNodeKey(node), node, level, parentId });
      if (node.type === 'section' && expanded.has(node.id))
        visit(node.children, node.id, level + 1);
    }
  };
  visit(tree.nodes, null, 1);
  return result;
}

export function isContextMenuCommandActive(tree: ContextMenuTree, command: string): boolean {
  const key = `command:${command}`;
  return visibleContextMenuNodes(tree, new Set(collectSectionIds(tree.nodes))).some(
    (row) => row.key === key
  );
}

function collectSectionIds(nodes: ContextMenuTreeNode[]): string[] {
  return nodes.flatMap((node) =>
    node.type === 'section' ? [node.id, ...collectSectionIds(node.children)] : []
  );
}
