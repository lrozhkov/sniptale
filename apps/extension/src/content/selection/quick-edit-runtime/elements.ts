import { isContentOwnedElement } from '../../platform/dom-host';
import type { EditableElement } from '../../../features/highlighter/contracts';

const QUICK_EDIT_TEXT_TAGS = [
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
];

const QUICK_EDIT_STYLE_TARGET_TAGS = [
  ...QUICK_EDIT_TEXT_TAGS,
  'article',
  'aside',
  'blockquote',
  'figure',
  'figcaption',
  'footer',
  'header',
  'img',
  'main',
  'nav',
  'section',
];

export function isQuickEditTextElement(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();

  if (!QUICK_EDIT_TEXT_TAGS.includes(tagName) || element.isContentEditable) {
    return false;
  }
  if (isContentOwnedElement(element)) {
    return false;
  }

  const text = element.textContent?.trim();
  if (
    !text ||
    (element.children.length > 0 && element.childNodes.length === element.children.length)
  ) {
    return false;
  }

  return true;
}

export function isQuickEditStyleInspectableElement(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  if (!QUICK_EDIT_STYLE_TARGET_TAGS.includes(tagName) || isContentOwnedElement(element)) {
    return false;
  }

  if (element instanceof HTMLImageElement) {
    return true;
  }

  return isQuickEditTextElement(element) || element.children.length > 0;
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
