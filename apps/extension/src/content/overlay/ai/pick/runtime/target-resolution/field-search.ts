import type { FieldNode, ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { findElementWithLegacyFallback } from './legacy-fallback';

export function findFieldElementById(
  id: string,
  tree: ParsedDOMTree
): { element: HTMLElement; node: FieldNode } | null {
  for (const section of tree.structure) {
    for (const child of section.children) {
      if (child.type !== 'field' || child.id !== id) {
        continue;
      }

      const target = findElementWithLegacyFallback(id, child.targetRef, child.selector);
      if (target) {
        return { element: target, node: child };
      }
    }
  }

  return null;
}
