import { expect, it } from 'vitest';
import type { SettingsTransferTreeNode } from '../../../../contracts/settings-transfer';
import { flattenTransferTree, toggleTransferTreeSelection } from './ui-helpers';

it('flattens nested transfer nodes and toggles both selection directions', () => {
  const child = node('capture.image', 'capture');
  const tree = [{ ...node('capture', null), children: [child] }];
  expect(flattenTransferTree(tree).map((item) => item.id)).toEqual(['capture', 'capture.image']);
  expect(toggleTransferTreeSelection(new Set(), tree[0]!, true, tree)).toEqual(
    new Set(['capture', 'capture.image'])
  );
  expect(
    toggleTransferTreeSelection(new Set(['capture', 'capture.image']), tree[0]!, false, tree)
  ).toEqual(new Set());
  expect(
    toggleTransferTreeSelection(new Set(['capture', 'capture.image']), child, false, tree)
  ).toEqual(new Set(['capture']));
});

function node(id: string, parentId: string | null): SettingsTransferTreeNode {
  return {
    id,
    parentId,
    domainId: id,
    labelKey: id,
    descriptionKey: id,
    kind: 'collection',
    classification: 'transferable',
    selectable: true,
    requiredBy: [],
    children: [],
  };
}
