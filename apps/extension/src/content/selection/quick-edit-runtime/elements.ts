import { isContentOwnedElement } from '../../platform/dom-host';
import type { EditableElement } from '../../../features/highlighter/contracts';

// policyStateIds: [] - Quick Edit tag catalogs are immutable selection policy.
const QUICK_EDIT_TEXT_TAGS = new Set([
  'p',
  'span',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'td',
  'th',
  'label',
  'a',
  'button',
  'blockquote',
  'caption',
  'dd',
  'dt',
  'figcaption',
  'legend',
  'summary',
]);
const QUICK_EDIT_NESTED_BLOCK_SELECTOR = [
  'blockquote',
  'caption',
  'dd',
  'div',
  'dt',
  'figcaption',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'legend',
  'li',
  'p',
  'summary',
  'td',
  'th',
].join(',');

export function isQuickEditTextElement(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();

  if (!QUICK_EDIT_TEXT_TAGS.has(tagName) || element.isContentEditable) {
    return false;
  }
  if (isContentOwnedElement(element)) {
    return false;
  }

  const text = element.textContent?.trim();
  if (!text) {
    return false;
  }

  // A generic container is editable only when it represents one leaf text block. Broad layout
  // containers remain navigation ancestors instead of becoming accidental whole-page edits.
  if (tagName === 'div' && element.querySelector(QUICK_EDIT_NESTED_BLOCK_SELECTOR)) return false;

  return true;
}

export function buildEditableElementRecord(element: HTMLElement): EditableElement {
  return {
    element,
    originalText: element.textContent || '',
    originalInnerHTML: element.innerHTML,
    originalChildNodes: Array.from(element.childNodes, (node) => node.cloneNode(true)),
    originalContentEditable: element.contentEditable,
    originalClass: element.getAttribute('class') || '',
    originalStyle: element.getAttribute('style') || '',
  };
}
