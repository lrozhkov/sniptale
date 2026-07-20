import type { ParsedDOMTree, TableRow } from '@sniptale/runtime-contracts/dom-tree';
import { findElementWithLegacyFallback } from './legacy-fallback';

export function findTableRowElementById(
  id: string,
  tree: ParsedDOMTree
): { element: HTMLElement; node: TableRow } | null {
  for (const section of tree.structure) {
    for (const child of section.children) {
      if (child.type !== 'table') {
        continue;
      }

      const row = child.rows.find((currentRow) => currentRow.id === id);
      if (!row) {
        continue;
      }

      const target = findElementWithLegacyFallback(id, row.targetRef, row.selector);
      if (target) {
        return { element: target, node: row };
      }
    }
  }

  return null;
}
