import type { FieldNode, ParsedDOMTree, TableNode } from '@sniptale/runtime-contracts/dom-tree';
import type { TreeNodeState } from '../types';

function createInitialNodeState(id: string, selected: boolean | undefined): TreeNodeState {
  return {
    id,
    expanded: true,
    selected: selected ?? false,
  };
}

export function buildInitialTreeState(treeData: ParsedDOMTree) {
  const nextState = new Map<string, TreeNodeState>();

  treeData.structure.forEach((section) => {
    nextState.set(section.id, createInitialNodeState(section.id, section.selected));

    section.children.forEach((child) => {
      if (child.type === 'field') {
        const field = child as FieldNode;
        nextState.set(field.id, createInitialNodeState(field.id, field.selected));
        return;
      }

      if (child.type === 'table') {
        const table = child as TableNode;
        nextState.set(table.id, createInitialNodeState(table.id, table.selected));
        table.rows.forEach((row) => {
          nextState.set(row.id, createInitialNodeState(row.id, row.selected));
        });
      }
    });
  });

  return nextState;
}
