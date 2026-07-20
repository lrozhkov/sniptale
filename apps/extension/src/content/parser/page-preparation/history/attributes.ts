import { isPageStyleProperty } from '@sniptale/runtime-contracts/page-style';
import {
  containsUnsafeCssSyntax,
  sanitizeWebSnapshotCssText,
} from '../../../../features/web-snapshot/public';

const HISTORY_ATTRIBUTE_URL_BASE = 'https://sniptale.invalid';
const SAFE_HISTORY_URL_PROTOCOLS = new Set(['blob:', 'http:', 'https:', 'mailto:', 'tel:']);

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
    if (containsUnsafeCssSyntax(`${property}: ${propertyValue};`)) {
      continue;
    }

    const priority = probe.style.getPropertyPriority(property);
    declarations.push(`${property}: ${propertyValue}${priority ? ` !${priority}` : ''};`);
  }

  return declarations.length > 0 ? declarations.join(' ') : null;
}

function isSafeHistoryUrlAttribute(name: string, value: string): boolean {
  const normalizedName = name.toLowerCase();
  if (normalizedName !== 'href' && normalizedName !== 'src') {
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

function hasSafeBlankRel(element: HTMLElement): boolean {
  const tokens = new Set((element.getAttribute('rel') ?? '').toLowerCase().split(/\s+/));
  return tokens.has('noopener') && tokens.has('noreferrer');
}

export function normalizeHistoryAttributes(
  document: Document,
  attributes: Record<string, string>
): Record<string, string> {
  const normalizedAttributes: Record<string, string> = {};

  Object.entries(attributes).forEach(([attributeName, attributeValue]) => {
    const name = attributeName.toLowerCase();
    if (name.startsWith('on') || !isSafeHistoryUrlAttribute(name, attributeValue)) {
      return;
    }

    if (name === 'style') {
      const sanitizedStyle = sanitizeHistoryStyleAttribute(document, attributeValue);
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

export function hasUnsafeHistoryAttributes(element: HTMLElement): boolean {
  return Array.from(element.attributes).some((attribute) => {
    const name = attribute.name.toLowerCase();
    if (name.startsWith('on') || !isSafeHistoryUrlAttribute(name, attribute.value)) {
      return true;
    }
    if (name === 'style') {
      return (
        sanitizeHistoryStyleAttribute(element.ownerDocument, attribute.value) !== attribute.value
      );
    }
    return (
      name === 'target' && attribute.value.toLowerCase() === '_blank' && !hasSafeBlankRel(element)
    );
  });
}
