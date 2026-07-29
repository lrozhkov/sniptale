import { isPageStyleProperty } from '@sniptale/runtime-contracts/page-style';
import { containsCssFunction } from '@sniptale/platform/security/css-safety';
import {
  containsUnsafeCssSyntax,
  sanitizeWebSnapshotCssText,
} from '../../../../features/web-snapshot/public';

const HISTORY_ATTRIBUTE_URL_BASE = 'https://sniptale.invalid';
const SAFE_HISTORY_URL_PROTOCOLS = new Set(['blob:', 'http:', 'https:', 'mailto:', 'tel:']);
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function sanitizeHistoryStyleAttribute(document: Document, value: string): string | null {
  const sanitizedValue = sanitizeWebSnapshotCssText(value);
  if (sanitizedValue.trim().length === 0) {
    return null;
  }

  const probe = document.createElement('div');
  probe.setAttribute('style', value);
  const declarations: string[] = [];

  for (let index = 0; index < probe.style.length; index += 1) {
    const property = probe.style[index];
    if (!isPageStyleProperty(property)) {
      continue;
    }

    const propertyValue = probe.style.getPropertyValue(property);
    if (
      containsUnsafeCssSyntax(`${property}: ${propertyValue};`) ||
      containsCssFunction(propertyValue, 'var')
    ) {
      continue;
    }

    const priority = probe.style.getPropertyPriority(property);
    declarations.push(`${property}: ${propertyValue}${priority ? ` !${priority}` : ''};`);
  }

  return declarations.length > 0 ? declarations.join(' ') : null;
}

function isSafeHistoryUrlAttribute(name: string, value: string): boolean {
  const qualifiedLocalName = name.toLowerCase().split(':').at(-1);
  if (qualifiedLocalName !== 'href' && qualifiedLocalName !== 'src') {
    return true;
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return true;
  }

  try {
    const parsedUrl = new URL(trimmedValue, HISTORY_ATTRIBUTE_URL_BASE);
    return SAFE_HISTORY_URL_PROTOCOLS.has(parsedUrl.protocol);
  } catch {
    return false;
  }
}

function mergeBlankTargetRel(value: string | undefined): string {
  const tokens = new Set(
    (value ?? '')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
  );
  tokens.add('noopener');
  tokens.add('noreferrer');
  return Array.from(tokens).join(' ');
}

function hasSafeBlankRel(element: Element): boolean {
  const tokens = new Set((element.getAttribute('rel') ?? '').toLowerCase().split(/\s+/));
  return tokens.has('noopener') && tokens.has('noreferrer');
}

export function isManagedHistoryAttribute(element: Element, attribute: Attr | string): boolean {
  if (element.namespaceURI !== SVG_NAMESPACE) {
    return true;
  }

  return typeof attribute === 'string'
    ? attribute === 'style'
    : attribute.namespaceURI === null &&
        attribute.localName === 'style' &&
        attribute.name === 'style';
}

export function normalizeHistoryAttributes(
  element: Element,
  attributes: Record<string, string>
): Record<string, string> {
  const normalizedAttributes: Record<string, string> = {};

  Object.entries(attributes).forEach(([attributeName, attributeValue]) => {
    const name = attributeName.toLowerCase();
    if (
      !isManagedHistoryAttribute(element, attributeName) ||
      name.startsWith('on') ||
      !isSafeHistoryUrlAttribute(name, attributeValue)
    ) {
      return;
    }

    if (name === 'style') {
      const sanitizedStyle = sanitizeHistoryStyleAttribute(element.ownerDocument, attributeValue);
      if (sanitizedStyle) {
        normalizedAttributes[attributeName] = sanitizedStyle;
      }
      return;
    }

    normalizedAttributes[attributeName] = attributeValue;
  });

  if (normalizedAttributes['target']?.toLowerCase() === '_blank') {
    normalizedAttributes['rel'] = mergeBlankTargetRel(normalizedAttributes['rel']);
  }

  return normalizedAttributes;
}

export function hasUnsafeHistoryAttributes(element: Element): boolean {
  return Array.from(element.attributes).some((attribute) => {
    if (!isManagedHistoryAttribute(element, attribute)) {
      return false;
    }

    const normalized = normalizeHistoryAttributes(element, {
      [attribute.name]: attribute.value,
    });
    if (normalized[attribute.name] !== attribute.value) return true;
    const name = attribute.name.toLowerCase();
    return (
      name === 'target' && attribute.value.toLowerCase() === '_blank' && !hasSafeBlankRel(element)
    );
  });
}
