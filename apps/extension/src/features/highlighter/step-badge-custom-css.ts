import type { CSSProperties } from 'react';
import { containsUnsafeCssSyntax } from '@sniptale/platform/security/css-safety';
import { validateCssString } from './css-sanitizer/css';

const TARGETS = ['badge', 'text'] as const;
type StepBadgeCssTarget = (typeof TARGETS)[number];

type StepBadgeCustomCssValidation = {
  blockedProperties: string[];
  error: 'blocked' | 'syntax' | 'unsafe' | null;
  styles: Record<StepBadgeCssTarget, CSSProperties>;
};

type StepBadgeCustomCssPolicyValidation = Pick<
  StepBadgeCustomCssValidation,
  'blockedProperties' | 'error'
>;

const EMPTY_STYLES: Record<StepBadgeCssTarget, CSSProperties> = { badge: {}, text: {} };
const ALLOWED_SOURCE_PROPERTIES: Record<StepBadgeCssTarget, ReadonlySet<string>> = {
  badge: new Set([
    'background',
    'background-color',
    'border-color',
    'border-radius',
    'border-style',
    'border-width',
    'box-shadow',
    'color',
    'filter',
    'opacity',
    'outline-color',
    'outline-offset',
    'outline-style',
    'outline-width',
    'text-shadow',
  ]),
  text: new Set([
    'color',
    'filter',
    'font-family',
    'font-style',
    'font-weight',
    'letter-spacing',
    'opacity',
    'text-decoration',
    'text-shadow',
    'text-transform',
  ]),
};

function toCamelStyleProperty(property: string) {
  return property.replace(/-([a-z])/gu, (_match, letter: string) => letter.toUpperCase());
}

const ALLOWED_PROPERTIES: Record<StepBadgeCssTarget, ReadonlySet<string>> = {
  badge: new Set([...ALLOWED_SOURCE_PROPERTIES.badge].map(toCamelStyleProperty)),
  text: new Set([...ALLOWED_SOURCE_PROPERTIES.text].map(toCamelStyleProperty)),
};

function fail(
  error: Exclude<StepBadgeCustomCssValidation['error'], null>,
  blockedProperties: string[] = []
): StepBadgeCustomCssValidation {
  return { blockedProperties, error, styles: EMPTY_STYLES };
}

function parseSections(value: string): Record<StepBadgeCssTarget, string[]> | null {
  const sections: Record<StepBadgeCssTarget, string[]> = { badge: [], text: [] };
  let target: StepBadgeCssTarget = 'badge';
  for (const line of value.split('\n')) {
    const trimmed = line.trim();
    const sectionMatch = /^\[([a-z]+)\]$/u.exec(trimmed);
    if (sectionMatch) {
      const nextTarget = sectionMatch[1];
      if (!TARGETS.some((candidate) => candidate === nextTarget)) return null;
      target = nextTarget as StepBadgeCssTarget;
      continue;
    }
    if (trimmed.startsWith('[') || trimmed.includes('{') || trimmed.includes('}')) return null;
    sections[target].push(line);
  }
  return sections;
}

function splitDeclarations(value: string): string[] | null {
  const declarations: string[] = [];
  let current = '';
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let inComment = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? '';
    const next = value[index + 1] ?? '';
    if (inComment) {
      if (character === '*' && next === '/') {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      current += character;
      if (character === '\\') {
        current += next;
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '/' && next === '*') {
      inComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === '(') depth += 1;
    if (character === ')') {
      depth -= 1;
      if (depth < 0) return null;
    }
    if (character === ';' && depth === 0) {
      if (current.trim()) declarations.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }

  if (quote || inComment || depth !== 0) return null;
  if (current.trim()) declarations.push(current.trim());
  return declarations;
}

export function validateStepBadgeCustomCss(value: string): StepBadgeCustomCssPolicyValidation {
  if (!value.trim()) return { blockedProperties: [], error: null };
  if (value.length > 4_000 || value.includes('@') || containsUnsafeCssSyntax(value)) {
    return { blockedProperties: [], error: 'unsafe' };
  }
  const sections = parseSections(value);
  if (!sections) return { blockedProperties: [], error: 'syntax' };

  const blockedProperties: string[] = [];
  for (const target of TARGETS) {
    const declarations = splitDeclarations(sections[target].join('\n'));
    if (!declarations) return { blockedProperties: [], error: 'syntax' };
    for (const declaration of declarations) {
      const separator = declaration.indexOf(':');
      if (separator <= 0) return { blockedProperties: [], error: 'syntax' };
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const propertyValue = declaration.slice(separator + 1).trim();
      if (
        !/^-?[a-z][a-z0-9-]*$/u.test(property) ||
        !propertyValue ||
        /!\s*important/iu.test(propertyValue)
      ) {
        return { blockedProperties: [], error: 'syntax' };
      }
      if (containsUnsafeCssSyntax(propertyValue)) {
        return { blockedProperties: [], error: 'unsafe' };
      }
      if (!ALLOWED_SOURCE_PROPERTIES[target].has(property)) blockedProperties.push(property);
    }
  }
  return blockedProperties.length > 0
    ? { blockedProperties: [...new Set(blockedProperties)], error: 'blocked' }
    : { blockedProperties: [], error: null };
}

export function resolveStepBadgeCustomCss(value: string): StepBadgeCustomCssValidation {
  const policy = validateStepBadgeCustomCss(value);
  if (policy.error) return fail(policy.error, policy.blockedProperties);
  if (!value.trim()) return { blockedProperties: [], error: null, styles: EMPTY_STYLES };
  const sections = parseSections(value);
  if (!sections) return fail('syntax'); // Kept defensive for resolver-local type narrowing.

  const styles = { ...EMPTY_STYLES };
  for (const target of TARGETS) {
    const declarations = sections[target].join('\n').trim();
    if (!declarations) continue;
    const validation = validateCssString(declarations);
    if (validation.rawError) return fail('syntax');
    if (
      Object.values(validation.styles).some(
        (styleValue) => typeof styleValue === 'string' && containsUnsafeCssSyntax(styleValue)
      )
    ) {
      return fail('unsafe');
    }
    const blockedProperties = [
      ...validation.blockedProps,
      ...Object.keys(validation.styles).filter(
        (property) => !ALLOWED_PROPERTIES[target].has(property)
      ),
    ];
    if (blockedProperties.length > 0) return fail('blocked', [...new Set(blockedProperties)]);
    styles[target] = validation.styles;
  }
  return { blockedProperties: [], error: null, styles };
}
