// policyStateIds: [] - CSS property/function sets are immutable sanitization allowlists, not authority state.
import { containsUnsafeCssSyntax } from '@sniptale/platform/security/css-safety';

const MAX_SURFACE_CSS_LENGTH = 4_000;
const MAX_SURFACE_DECLARATIONS = 32;

const ALLOWED_PROPERTIES = new Set([
  'backdrop-filter',
  'background',
  'background-color',
  'background-image',
  'background-position',
  'background-repeat',
  'background-size',
  'box-shadow',
  'color',
  'filter',
  'opacity',
  'outline-color',
  'outline-offset',
  'outline-style',
  'outline-width',
  'text-shadow',
]);

const BACKGROUND_LONGHANDS = new Set([
  'background-color',
  'background-image',
  'background-position',
  'background-repeat',
  'background-size',
]);

const UNSAFE_FUNCTIONS = [
  'url',
  'var',
  'image',
  'image-set',
  'cross-fade',
  'element',
  'paint',
  'attr',
  'expression',
];
function hasUnsafeSyntax(value: string): boolean {
  const lower = value.toLowerCase();
  if (containsUnsafeCssSyntax(value)) return true;
  if (['{', '}', '@', '!', '<', '>', '\\'].some((token) => lower.includes(token))) return true;
  return UNSAFE_FUNCTIONS.some((name) => {
    let index = lower.indexOf(name);
    while (index >= 0) {
      let cursor = index + name.length;
      while (lower[cursor] === ' ' || lower[cursor] === '\t' || lower[cursor] === '\n') cursor += 1;
      if (lower[cursor] === '(') return true;
      index = lower.indexOf(name, index + 1);
    }
    return false;
  });
}

function isBoundedDecimal(value: string): boolean {
  const [integer, fraction, extra] = value.split('.');
  if (
    extra !== undefined ||
    !integer ||
    ![...integer].every((character) => character >= '0' && character <= '9')
  ) {
    return false;
  }
  return (
    fraction === undefined ||
    (fraction.length >= 1 &&
      fraction.length <= 3 &&
      [...fraction].every((character) => character >= '0' && character <= '9'))
  );
}

function isPropertyName(value: string): boolean {
  if (value.startsWith('--') || value.length === 0) return false;
  if (value[0]! < 'a' || value[0]! > 'z') return false;
  return [...value.slice(1)].every(
    (character) =>
      (character >= 'a' && character <= 'z') ||
      (character >= '0' && character <= '9') ||
      character === '-'
  );
}

function splitDeclarations(value: string): string[] | null {
  const declarations: string[] = [];
  let current = '';
  let depth = 0;
  let quote = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (quote) {
      if (character === '\\') {
        current += character + (value[index + 1] ?? '');
        index += 1;
        continue;
      }
      if (character === quote) quote = '';
      current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (depth < 0) return null;
    if (character === ';' && depth === 0) {
      if (current.trim()) declarations.push(current.trim());
      current = '';
    } else current += character;
  }
  if (quote || depth !== 0) return null;
  if (current.trim()) declarations.push(current.trim());
  return declarations;
}

function findTopLevelColon(value: string): number {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1;
    else if (value[index] === ')') depth -= 1;
    else if (value[index] === ':' && depth === 0) return index;
  }
  return -1;
}

function normalizeDecimal(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function canonicalizeBackdropFilter(value: string): string | null {
  if (value === 'none') return value;
  const functions: string[] = [];
  const seen = new Set<string>();
  let rest = value.trim();
  while (rest) {
    const match = /^(blur|saturate|brightness|contrast)\(([^()]*)\)(?:\s+|$)/u.exec(rest);
    if (!match || functions.length === 4 || seen.has(match[1]!)) return null;
    const name = match[1]!;
    const raw = match[2]!.trim();
    if (name === 'blur') {
      if (!raw.endsWith('px') || !isBoundedDecimal(raw.slice(0, -2))) return null;
      const numeric = Number(raw.slice(0, -2));
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 40) return null;
      functions.push(`blur(${normalizeDecimal(numeric)}px)`);
    } else {
      const percentage = raw.endsWith('%');
      const numericText = percentage ? raw.slice(0, -1) : raw;
      if (!isBoundedDecimal(numericText)) return null;
      const numeric = Number(numericText);
      const normalized = percentage ? numeric / 100 : numeric;
      if (!Number.isFinite(normalized) || normalized < 0 || normalized > 3) return null;
      functions.push(`${name}(${normalizeDecimal(normalized)})`);
    }
    seen.add(name);
    rest = rest.slice(match[0].length).trim();
  }
  return functions.length > 0 ? functions.join(' ') : null;
}

function canonicalizeValue(property: string, value: string): string | null {
  const trimmed = value.trim().replace(/\s+/gu, ' ');
  if (!trimmed || hasUnsafeSyntax(trimmed) || trimmed.includes(';')) return null;
  if (property === 'backdrop-filter') return canonicalizeBackdropFilter(trimmed.toLowerCase());
  return trimmed;
}

export function canonicalizeSurfaceCss(value: string): string | null {
  if (value.length > MAX_SURFACE_CSS_LENGTH || hasUnsafeSyntax(value)) return null;
  const declarations = splitDeclarations(value);
  if (!declarations || declarations.length > MAX_SURFACE_DECLARATIONS) return null;
  const canonical = new Map<string, string>();
  for (const declaration of declarations) {
    const colon = findTopLevelColon(declaration);
    if (colon <= 0 || findTopLevelColon(declaration.slice(colon + 1)) >= 0) return null;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    if (!isPropertyName(property) || !ALLOWED_PROPERTIES.has(property) || canonical.has(property)) {
      return null;
    }
    const normalized = canonicalizeValue(property, declaration.slice(colon + 1));
    if (normalized === null) return null;
    canonical.set(property, normalized);
  }
  if (canonical.has('background')) {
    for (const longhand of BACKGROUND_LONGHANDS) if (canonical.has(longhand)) return null;
  }
  return [...canonical.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([property, declaration]) => `${property}: ${declaration};`)
    .join('\n');
}

export function projectCanonicalSurfaceCss(value: string): Record<string, string> | null {
  const canonical = canonicalizeSurfaceCss(value);
  if (canonical === null) return null;
  const projection: Record<string, string> = {};
  for (const declaration of splitDeclarations(canonical) ?? []) {
    const colon = findTopLevelColon(declaration);
    const property = declaration.slice(0, colon).trim();
    const reactProperty = property.replace(/-([a-z])/gu, (_match, letter: string) =>
      letter.toUpperCase()
    );
    projection[reactProperty] = declaration.slice(colon + 1).trim();
  }
  return projection;
}

export function surfaceCssOverridesPaint(value: string): boolean {
  const canonical = canonicalizeSurfaceCss(value);
  if (canonical === null) return false;
  return /^(?:background|background-color|background-image):/mu.test(canonical);
}
