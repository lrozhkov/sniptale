import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';
import { updateTextPreservingStructure } from './structure';

function normalizeInlineText(text: string | null | undefined): string {
  return (text ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function preserveCompositeLabelText(
  element: HTMLElement,
  newValue: string,
  node: FieldNode
): boolean {
  const labelPrefix = `${node.label}:`;
  const currentText = normalizeInlineText(element.textContent);
  const currentTitle = normalizeInlineText(element.getAttribute('title'));
  if (!currentText.startsWith(labelPrefix) && !currentTitle.startsWith(labelPrefix)) {
    return false;
  }

  if (element.children.length === 0) {
    element.textContent = `${labelPrefix} ${newValue}`;
    return true;
  }

  const separator = element.querySelector<HTMLElement>('.TextBoxWithIcon__separator');
  if (separator) {
    separator.textContent = newValue;
    element.replaceChildren(`${labelPrefix} `, separator);
    return true;
  }

  const directTextNode = Array.from(element.childNodes).find((child) => {
    return child.nodeType === Node.TEXT_NODE && child.textContent?.includes(':');
  });
  if (directTextNode) {
    directTextNode.textContent = `${labelPrefix} `;
  }

  const lastChild = element.lastElementChild;
  if (lastChild instanceof HTMLElement) {
    updateTextPreservingStructure(lastChild, newValue);
    return true;
  }

  element.textContent = `${labelPrefix} ${newValue}`;
  return true;
}
