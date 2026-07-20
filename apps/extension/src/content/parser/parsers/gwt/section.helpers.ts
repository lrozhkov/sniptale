import {
  extractCleanText,
  isConcatenatedValues,
  isFieldLabel,
  isHeaderOnlyElement,
  TECHNICAL_CODES,
} from '../../dom-utils/dom-helpers';

function isFieldTitle(title: string, element: HTMLElement): boolean {
  if (title.endsWith(':')) {
    return true;
  }

  const cleanTitle = title.replace(/[:\s]+$/, '');
  if (cleanTitle.length < 3) {
    return true;
  }

  return Boolean(
    element.closest('tr')?.querySelector('.attrTitle, .attrValue, td.attrTitle, td.attrValue')
  );
}

function extractPrioritizedTitle(element: HTMLElement, selector: string, skipFieldLabel = true) {
  const candidate = element.querySelector(selector) as HTMLElement | null;
  if (
    !candidate ||
    !isHeaderOnlyElement(candidate) ||
    (skipFieldLabel && isFieldLabel(candidate))
  ) {
    return null;
  }

  const title = extractCleanText(candidate);
  if (
    !title ||
    title.length >= 100 ||
    isConcatenatedValues(title) ||
    isFieldTitle(title, candidate)
  ) {
    return null;
  }

  return title;
}

function extractCodeTitle(element: HTMLElement) {
  const code = element.querySelector('[__code]')?.getAttribute('__code');
  if (!code || code.match(/^\d+$/) || TECHNICAL_CODES.includes(code.toLowerCase())) {
    return null;
  }

  const readableTitle = code
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (value) => value.toUpperCase())
    .trim();

  return readableTitle.length > 3 &&
    readableTitle.length < 50 &&
    !isConcatenatedValues(readableTitle)
    ? readableTitle
    : null;
}

function extractEmbeddedContentTitle(element: HTMLElement) {
  if (!element.id?.includes('EmbeddedApplicationContent.')) {
    return null;
  }

  const idPart = element.id.split('EmbeddedApplicationContent.')[1];
  if (!idPart) {
    return null;
  }
  const knownSections: Record<string, string> = {
    dynamicFields: 'Дополнительные параметры',
    curStateDynamicFieldsAlt: 'Параметры текущего статуса',
    richText: 'Описание',
    comments: 'Комментарии',
    files: 'Вложения',
    history: 'История',
    links: 'Связи',
  };

  const knownSectionTitle = knownSections[idPart];
  if (knownSectionTitle) {
    return knownSectionTitle;
  }

  const matchedSection = Object.entries(knownSections).find(([key]) =>
    idPart.toLowerCase().includes(key.toLowerCase())
  );
  if (matchedSection) {
    return matchedSection[1];
  }

  const readable = idPart
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (value) => value.toUpperCase())
    .trim();
  return readable.length > 2 ? readable : null;
}

function extractGWTSectionTitle(element: HTMLElement): string | null {
  return (
    extractPrioritizedTitle(element, '[id*="title" i]') ||
    extractPrioritizedTitle(element, '.GAQEVERAM') ||
    extractCodeTitle(element) ||
    extractPrioritizedTitle(element, '.header, .gwt-DisclosurePanel .header', false) ||
    extractPrioritizedTitle(element, '[id*="header" i], [id*="caption" i]', false) ||
    extractPrioritizedTitle(
      element,
      '[class*="title" i], [class*="header" i], [class*="caption" i]',
      false
    ) ||
    extractEmbeddedContentTitle(element)
  );
}

export function findSectionTitle(element: HTMLElement): string {
  const gwtTitle = extractGWTSectionTitle(element);
  if (gwtTitle) {
    return gwtTitle;
  }

  const titleAttr = element.querySelector('[title]') as HTMLElement | null;
  if (titleAttr && isHeaderOnlyElement(titleAttr)) {
    const title = extractCleanText(titleAttr);
    if (title && title.length < 100) {
      return title;
    }
  }

  const firstTextNode = element.querySelector('td.attrTitle, th, .gwt-Label, .GAQEVERAM');
  if (!firstTextNode) {
    return '';
  }

  const title = extractCleanText(firstTextNode as HTMLElement);
  if (!title || title.length >= 100 || title.match(/^\d+$/) || title.includes(':')) {
    return '';
  }

  return isConcatenatedValues(title) ? '' : title;
}
