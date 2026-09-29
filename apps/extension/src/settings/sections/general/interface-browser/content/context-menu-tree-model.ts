import type {
  ContextMenuCommandNode,
  ContextMenuTree,
  ContextMenuTreeNode,
} from '../../../../../contracts/settings/context-menu-layout';

type Position = { parentId: string | null; index: number };

export function contextMenuNodeKey(node: ContextMenuTreeNode): string {
  return node.type === 'section' ? `section:${node.id}` : `command:${node.command}`;
}

export function findContextMenuNode(
  tree: ContextMenuTree,
  key: string
): ContextMenuTreeNode | null {
  for (const node of tree.nodes) {
    if (contextMenuNodeKey(node) === key) return node;
    if (node.type === 'section') {
      const child = node.children.find((entry) => contextMenuNodeKey(entry) === key);
      if (child) return child;
    }
  }
  return null;
}

export function contextMenuNodePosition(tree: ContextMenuTree, key: string): Position | null {
  for (let index = 0; index < tree.nodes.length; index += 1) {
    const node = tree.nodes[index]!;
    if (contextMenuNodeKey(node) === key) return { parentId: null, index };
    if (node.type === 'section') {
      const childIndex = node.children.findIndex((entry) => contextMenuNodeKey(entry) === key);
      if (childIndex >= 0) return { parentId: node.id, index: childIndex };
    }
  }
  return null;
}

function getItems(tree: ContextMenuTree, parentId: string | null): ContextMenuTreeNode[] | null {
  if (parentId === null) return tree.nodes;
  const section = tree.nodes.find((node) => node.type === 'section' && node.id === parentId);
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
  if (node.type === 'section' && destination.parentId !== null) return tree;
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
  index: number
): {
  tree: ContextMenuTree;
  key: string;
} | null {
  if (tree.nodes.filter((node) => node.type === 'section').length >= 9) return null;
  if (!Number.isInteger(index) || index < 0 || index > tree.nodes.length) return null;
  let number = 1;
  while (tree.nodes.some((node) => node.type === 'section' && node.id === `section-${number}`))
    number += 1;
  const id = `section-${number}`;
  const next = structuredClone(tree);
  next.nodes.splice(index, 0, { type: 'section', id, title: '', enabled: true, children: [] });
  return { tree: next, key: `section:${id}` };
}

export function addContextMenuCommand(
  tree: ContextMenuTree,
  command: string,
  destination: Position
): ContextMenuTree {
  if (findContextMenuNode(tree, `command:${command}`)) return tree;
  const next = structuredClone(tree);
  const target = getItems(next, destination.parentId);
  if (
    !target ||
    !Number.isInteger(destination.index) ||
    destination.index < 0 ||
    destination.index > target.length
  )
    return tree;
  const commandNode: ContextMenuCommandNode = { type: 'command', command, enabled: true };
  target.splice(destination.index, 0, commandNode);
  return next;
}

export function removeContextMenuNode(tree: ContextMenuTree, key: string): ContextMenuTree {
  const source = contextMenuNodePosition(tree, key);
  if (!source) return tree;
  const next = structuredClone(tree);
  const items = getItems(next, source.parentId)!;
  const [removed] = items.splice(source.index, 1);
  if (removed?.type === 'section')
    items.splice(
      source.index,
      0,
      ...removed.children.map((child) => ({ ...child, enabled: removed.enabled && child.enabled }))
    );
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
  return tree.nodes.flatMap((node) => {
    const key = contextMenuNodeKey(node);
    const entry = { key, node, level: 1, parentId: null };
    return node.type === 'section' && expanded.has(node.id)
      ? [
          entry,
          ...node.children.map((child) => ({
            key: contextMenuNodeKey(child),
            node: child,
            level: 2,
            parentId: node.id,
          })),
        ]
      : [entry];
  });
}
