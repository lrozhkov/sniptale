import type { FieldNode, SectionNode, TableNode } from '@sniptale/runtime-contracts/dom-tree';
import { getDefaultTreeNodeState } from '../tree/helpers';
import type { TreeRenderProps } from '../tree/types';
import { FieldRow } from './field-row';
import { TableSection } from './table';

type TreeSectionChildrenProps = {
  section: SectionNode;
  treeRenderProps: TreeRenderProps;
};

export function TreeSectionChildren({ section, treeRenderProps }: TreeSectionChildrenProps) {
  return (
    <div style={{ marginLeft: '28px', marginTop: '4px' }}>
      {section.children.map((child) => {
        if (child.type === 'field') {
          return (
            <FieldRow
              key={child.id}
              field={child as FieldNode}
              state={getDefaultTreeNodeState(child.id, true, treeRenderProps)}
              toggleSelected={treeRenderProps.toggleSelected}
            />
          );
        }

        if (child.type === 'table') {
          return (
            <TableSection
              key={child.id}
              table={child as TableNode}
              treeRenderProps={treeRenderProps}
            />
          );
        }

        return null;
      })}
    </div>
  );
}
