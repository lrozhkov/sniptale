import type { AIEditChange, ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { findFieldElementById } from './field-search';
import { findTableRowElementById } from './table-row-search';

export function findAIChangeTargets(tree: ParsedDOMTree, changes: AIEditChange[]): HTMLElement[] {
  const targets = new Map<HTMLElement, HTMLElement>();

  for (const change of changes) {
    if (change.type === 'field') {
      const result = findFieldElementById(change.fieldId, tree);
      if (result) {
        targets.set(result.element, result.element);
      }
      continue;
    }

    if (change.type === 'tableRow') {
      const result = findTableRowElementById(change.rowId, tree);
      if (result) {
        targets.set(result.element, result.element);
      }
    }
  }

  return [...targets.values()];
}
