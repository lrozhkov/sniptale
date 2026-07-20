import { getContainingIframe } from '../../platform/frame/core';
import { getIframeSelector, serializeCompositeSelector } from '../../platform/frame/selectors';

const HIDDEN_STYLE_TOKENS = [
  'display:none',
  'display: none',
  'visibility:hidden',
  'visibility: hidden',
];
const TECHNICAL_CLASS_PREFIXES = /^(sniptale-|shadow-)/;
const TECHNICAL_CODES = [
  'up',
  'down',
  'left',
  'right',
  'true',
  'false',
  'yes',
  'no',
  'on',
  'off',
  'open',
  'close',
  'show',
  'hide',
  'add',
  'remove',
  'edit',
  'delete',
  'save',
  'cancel',
  'ok',
  'apply',
  'reset',
  'fullscreen',
  'collapse',
  'expand',
  'toggle',
  'select',
  'deselect',
];

export { TECHNICAL_CODES };

function getSelectorQueryRoot(element: HTMLElement): ParentNode {
  let current: HTMLElement = element;

  while (current.parentElement) {
    current = current.parentElement;
  }

  return current;
}

function escapeCssIdentifier(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

export function isQuicklyHidden(element: Element): boolean {
  const style = element.getAttribute('style');
  if (style && HIDDEN_STYLE_TOKENS.some((token) => style.includes(token))) {
    return true;
  }

  if ((element as HTMLElement).hidden) return true;
  if (element.getAttribute('aria-hidden') === 'true') return true;

  return element.tagName === 'INPUT' && (element as HTMLInputElement).type === 'hidden';
}

export function isElementVisible(element: HTMLElement): boolean {
  if (!element) return false;

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  return !(element.hasAttribute('aria-hidden') && element.getAttribute('aria-hidden') === 'true');
}

export function getSelector(element: HTMLElement): string {
  const localSelector = element.id
    ? `#${escapeCssIdentifier(element.id)}`
    : (getIndexedTableSelector(element, 'table.attrList', 'tbody tr') ??
      getIndexedTableSelector(
        element,
        'table.cellTableWidget',
        'tbody tr.tableRow, tbody tr',
        'tr.tableRow'
      ) ??
      getFallbackSelector(element));

  return withIframeContext(element, localSelector);
}

function getIndexedTableSelector(
  element: HTMLElement,
  tableSelector: string,
  rowSelector: string,
  rowClosestSelector: string = 'tr'
): string | null {
  const row = element.closest(rowClosestSelector);
  const table = row?.closest('table');
  if (!row || !table) {
    return null;
  }

  const queryRoot = getSelectorQueryRoot(element);
  const allTables = Array.from(queryRoot.querySelectorAll(tableSelector));
  const tableIndex = allTables.indexOf(table);
  const rows = Array.from(table.querySelectorAll(rowSelector));
  const rowIndex = rows.indexOf(row);
  if (tableIndex < 0 || rowIndex < 0) {
    return null;
  }

  const elementSelector = element === row ? '' : ` ${getFallbackSelector(element)}`;
  return `${tableSelector}:nth-of-type(${tableIndex + 1}) tbody tr:nth-child(${rowIndex + 1})${elementSelector}`;
}

function withIframeContext(element: HTMLElement, elementSelector: string) {
  const iframe = getContainingIframe(element);
  if (!iframe) {
    return elementSelector;
  }

  return serializeCompositeSelector({
    iframeSelector: getIframeSelector(iframe),
    elementSelector,
  });
}

function getFallbackSelector(element: HTMLElement): string {
  const tagName = element.tagName.toLowerCase();
  const classes = Array.from(element.classList)
    .filter((className) => !TECHNICAL_CLASS_PREFIXES.test(className))
    .join('.');

  return classes ? `${tagName}.${classes}` : tagName;
}
