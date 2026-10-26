import {
  PAGE_STYLE_ALLOWED_PROPERTIES,
  isPageStyleProperty,
  type PageStyleDeclaration,
} from '@sniptale/runtime-contracts/page-style';
import type { PageStyleMutationElement } from '../../../selection/design-review/style/types';
import { validateCssDeclaration } from '../../../selection/design-review/style/validation';

interface ElementInspection {
  label: string;
  width: number;
  height: number;
  values: Record<string, string>;
}

/** Captures values, not a live reference, so comparison A remains stable during edits. */
export function inspectReviewElement(element: Element, label: string): ElementInspection {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return {
    label,
    width: rect.width,
    height: rect.height,
    values: Object.fromEntries(
      PAGE_STYLE_ALLOWED_PROPERTIES.map((property) => [
        property,
        style?.getPropertyValue(property) ?? '',
      ])
    ),
  };
}

function splitDeclarations(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let quote = '';
  let depth = 0;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (depth < 0) throw new Error('Invalid CSS');
    if (character === ';' && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  if (quote || depth || escaped) throw new Error('Invalid CSS');
  parts.push(text.slice(start));
  return parts.filter((part) => part.trim());
}

export class ReviewCssValidationError extends Error {
  constructor(
    readonly property: string,
    readonly reason: 'unsupported' | 'duplicate' | 'value'
  ) {
    super('Invalid CSS declaration');
    this.name = 'ReviewCssValidationError';
  }
}

/** Refuses an entire draft before mutation if any declaration violates the existing policy. */
export function parseReviewCss(
  element: PageStyleMutationElement,
  text: string
): PageStyleDeclaration[] {
  if (text.length > 16000 || /[{}@]|\/\*/u.test(text)) throw new Error('Invalid CSS');
  const seen = new Set<string>();
  const declarations = splitDeclarations(text).map((part) => {
    const colon = part.indexOf(':');
    const property = part.slice(0, colon).trim();
    const value = part.slice(colon + 1).trim();
    if (colon < 1) throw new Error('Invalid CSS');
    if (!isPageStyleProperty(property))
      throw new ReviewCssValidationError(property.slice(0, 80), 'unsupported');
    if (!value) throw new ReviewCssValidationError(property, 'value');
    if (seen.has(property)) throw new ReviewCssValidationError(property, 'duplicate');
    seen.add(property);
    const result = validateCssDeclaration(element, { property, value });
    if (result.status !== 'valid') throw new ReviewCssValidationError(property, 'value');
    return { property, value: result.value };
  });
  if (!declarations.length) throw new Error('Invalid CSS');
  return declarations;
}

/** Only pixel translations can be nudged without guessing how to convert another CSS coordinate system. */
export function readPixelTranslation(value: string): { x: number; y: number } | null {
  if (!value || value === 'none') return { x: 0, y: 0 };
  const parts = value.trim().split(/\s+/u);
  if (
    parts.length > 2 ||
    !parts.every((part) => {
      const numeric = part.endsWith('px') ? part.slice(0, -2) : part;
      return /^-?[\d.]+$/u.test(numeric) && Number.isFinite(Number(numeric));
    })
  )
    return null;
  return { x: Number.parseFloat(parts[0]!), y: Number.parseFloat(parts[1] ?? '0') };
}
