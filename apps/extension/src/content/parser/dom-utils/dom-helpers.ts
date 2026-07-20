/**
 * DOM Helper utilities for parsers
 * Extracted from dom-tree-parser.ts for reusability
 */

export {
  getSelector,
  isElementVisible,
  isQuicklyHidden,
  TECHNICAL_CODES,
} from './dom-helpers-selectors';
export {
  extractCompositeText,
  determineValueType,
  extractCleanText,
  extractImageText,
  extractLinkText,
  extractNarrativeText,
  setGetOriginalElementFn,
  setSniptaleId,
} from './dom-helpers-text';

/**
 * Checks if element is "header-only" (doesn't contain field values)
 */
export function isHeaderOnlyElement(element: HTMLElement): boolean {
  const hasValueElements = element.querySelector(
    '.attrValue, .stringView, .richTextPlainView, .yesNo, .stateColWithTitleView'
  );
  if (hasValueElements) return false;

  const text = element.textContent?.trim() || '';
  if (text.length > 100) return false;

  return true;
}

/**
 * Checks if element is a field label (not a section header)
 */
export function isFieldLabel(element: HTMLElement): boolean {
  if (element.closest('tr')) {
    const row = element.closest('tr');
    if (row?.querySelector('.attrTitle, .attrValue, td.attrTitle, td.attrValue')) {
      return true;
    }
  }

  const className = element.className || '';
  if (className.includes('attrTitle') || className.includes('field-label')) {
    return true;
  }

  const text = element.textContent?.trim() || '';
  if (text.endsWith(':') && text.length < 50) {
    return true;
  }

  return false;
}

/**
 * Checks if text is concatenated values (e.g., "Тип контактаЗначениеДля уведомлений")
 */
export function isConcatenatedValues(text: string): boolean {
  if (text.includes(' ')) return false;

  // CamelCase pattern without spaces = concatenated values
  const camelCaseMatches = text.match(/[a-zа-яё][A-ZА-ЯЁ]/g);
  if (camelCaseMatches && camelCaseMatches.length >= 2) {
    return true;
  }

  return false;
}
