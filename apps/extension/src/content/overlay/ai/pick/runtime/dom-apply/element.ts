import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';
import { preserveCompositeLabelText } from './label';
import { updateTextPreservingStructure } from './structure';

export function applyEditToElement(element: HTMLElement, newValue: string, node: FieldNode): void {
  if (node.valueType === 'image' || node.valueType === 'status') {
    return;
  }

  if (preserveCompositeLabelText(element, newValue, node)) {
    return;
  }

  const link = element.querySelector('a');
  if (link) {
    updateTextPreservingStructure(link as HTMLElement, newValue);
    return;
  }

  if (element.tagName === 'A') {
    updateTextPreservingStructure(element, newValue);
    return;
  }

  if (element.tagName === 'TD' || element.tagName === 'DIV') {
    const target = element.querySelector<HTMLElement>('.stringView') ?? element;
    const targetLink = target.querySelector<HTMLElement>('a');
    updateTextPreservingStructure(targetLink ?? target, newValue);
    return;
  }

  updateTextPreservingStructure(element, newValue);
}
