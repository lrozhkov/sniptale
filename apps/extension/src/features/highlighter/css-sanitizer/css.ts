import type { CSSProperties } from 'react';
import { containsUnsafeCssSyntax } from '@sniptale/platform/security/css-safety';

import { translate } from '../../../platform/i18n';

function toCamelStyleProperty(propName: string) {
  return propName.replace(/-([a-z])/g, (_match: string, letter: string) => letter.toUpperCase());
}

const BLOCKED_CSS_PROPS = [
  'position',
  'top',
  'left',
  'right',
  'bottom',
  'transform',
  'translate',
  'rotate',
  'scale',
  'zIndex',
  'float',
  'clear',
  'display',
  'visibility',
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'boxSizing',
  'overflow',
  'overflowX',
  'overflowY',
  'pointerEvents',
  'cursor',
];

interface CssValidationResult {
  styles: CSSProperties & Record<string, string>;
  blockedProps: string[];
  hasBlockedProps: boolean;
  rawError: string | null;
}

type RestrictedCssResolution = Pick<CssValidationResult, 'blockedProps' | 'styles'> & {
  error: 'blocked' | 'syntax' | 'unsafe' | null;
};

type CssDeclaration = { name: string; value: string };

const CHROMIUM_VENDOR_PROPERTIES = new Set([
  '-webkit-clip-path',
  '-webkit-mask',
  '-webkit-transform',
  'zoom',
]);

function splitCssDeclarations(value: string): string[] | null {
  const declarations: string[] = [];
  let current = '';
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let inComment = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? '';
    const next = value[index + 1] ?? '';
    if (inComment) {
      if (char === '*' && next === '/') {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      current += char;
      if (char === '\\') {
        current += next;
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '/' && next === '*') {
      inComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth < 0) return null;
    }
    if (char === ';' && depth === 0) {
      if (current.trim()) declarations.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (quote || inComment || depth !== 0) return null;
  if (current.trim()) declarations.push(current.trim());
  return declarations;
}

export function parseCssDeclarations(value: string): CssDeclaration[] | null {
  const declarations = splitCssDeclarations(value);
  if (!declarations) return null;
  const parsed: CssDeclaration[] = [];
  for (const declaration of declarations) {
    const colonIndex = declaration.indexOf(':');
    if (colonIndex <= 0) return null;
    const name = declaration.slice(0, colonIndex).trim().toLowerCase();
    const propertyValue = declaration.slice(colonIndex + 1).trim();
    if (
      !/^-?[a-z][a-z0-9-]*$/u.test(name) ||
      !propertyValue ||
      /!\s*important/iu.test(propertyValue)
    ) {
      return null;
    }
    parsed.push({ name, value: propertyValue });
  }
  return parsed;
}

function admitCustomCssValue(value: string, maxLength: number): 'empty' | 'unsafe' | 'valid' {
  if (!value.trim()) return 'empty';
  return value.length > maxLength || value.includes('@') || containsUnsafeCssSyntax(value)
    ? 'unsafe'
    : 'valid';
}

export function parseAdmittedCustomCssSections<Target extends string>(
  value: string,
  config: {
    defaultTarget: Target;
    maxLength: number;
    targets: readonly Target[];
  }
):
  | { result: { blockedProperties: string[]; error: 'syntax' | 'unsafe' | null }; sections: null }
  | { result: null; sections: Record<Target, string[]> } {
  const admission = admitCustomCssValue(value, config.maxLength);
  if (admission === 'unsafe') {
    return { result: { blockedProperties: [], error: 'unsafe' }, sections: null };
  }
  if (admission === 'empty') {
    return { result: { blockedProperties: [], error: null }, sections: null };
  }
  const sections = parseNamedCssSections(value, config.targets, config.defaultTarget);
  return sections
    ? { result: null, sections }
    : { result: { blockedProperties: [], error: 'syntax' }, sections: null };
}

export function prepareCustomCssResolution<Target extends string>(
  value: string,
  policyError: 'blocked' | 'syntax' | 'unsafe' | null,
  config: {
    defaultTarget: Target;
    targets: readonly Target[];
  }
):
  | { error: 'blocked' | 'syntax' | 'unsafe'; sections: null }
  | { empty: boolean; error: null; sections: Record<Target, string[]> } {
  if (policyError) return { error: policyError, sections: null };
  const sections = parseNamedCssSections(value, config.targets, config.defaultTarget);
  return sections
    ? { empty: !value.trim(), error: null, sections }
    : { error: 'syntax', sections: null };
}

function parseNamedCssSections<Target extends string>(
  value: string,
  targets: readonly Target[],
  defaultTarget: Target
): Record<Target, string[]> | null {
  const sections = {} as Record<Target, string[]>;
  for (const target of targets) sections[target] = [];
  let target = defaultTarget;
  for (const line of value.split('\n')) {
    const trimmed = line.trim();
    const sectionMatch = /^\[([a-z]+)\]$/u.exec(trimmed);
    if (sectionMatch) {
      const nextTarget = sectionMatch[1];
      if (!targets.some((candidate) => candidate === nextTarget)) return null;
      target = nextTarget as Target;
      continue;
    }
    if (trimmed.startsWith('[') || trimmed.includes('{') || trimmed.includes('}')) return null;
    sections[target].push(line);
  }
  return sections;
}

export function validateCssPolicyString(cssString: string): {
  blockedProps: string[];
  properties: string[];
  rawError: boolean;
} {
  if (!cssString) return { blockedProps: [], properties: [], rawError: false };
  if (containsUnsafeCssSyntax(cssString)) {
    return { blockedProps: [], properties: [], rawError: true };
  }
  const declarations = parseCssDeclarations(cssString);
  if (!declarations) return { blockedProps: [], properties: [], rawError: true };
  const properties = declarations.map(({ name }) => toCamelStyleProperty(name));
  return {
    blockedProps: declarations
      .filter(({ name }) => BLOCKED_CSS_PROPS.includes(toCamelStyleProperty(name)))
      .map(({ name }) => name),
    properties,
    rawError: false,
  };
}

function recognizeCssDeclaration(declaration: CssDeclaration): string | null {
  const probe = document.createElement('div').style;
  probe.setProperty(declaration.name, declaration.value);
  if (probe.getPropertyPriority(declaration.name)) return null;
  const normalizedValue = probe.getPropertyValue(declaration.name).trim();
  if (normalizedValue) return normalizedValue;
  return CHROMIUM_VENDOR_PROPERTIES.has(declaration.name) ? declaration.value : null;
}

export function validateCssString(cssString: string): CssValidationResult {
  if (!cssString || typeof cssString !== 'string') {
    return { styles: {}, blockedProps: [], hasBlockedProps: false, rawError: null };
  }

  const result: CssValidationResult = {
    styles: {},
    blockedProps: [],
    hasBlockedProps: false,
    rawError: null,
  };

  try {
    if (containsUnsafeCssSyntax(cssString)) {
      result.rawError = translate('shared.runtime.cssRecognitionFailed');
      return result;
    }
    const declarations = parseCssDeclarations(cssString);
    if (!declarations) {
      result.rawError = translate('shared.runtime.cssRecognitionFailed');
      return result;
    }

    for (const declaration of declarations) {
      const propValue = recognizeCssDeclaration(declaration);
      if (propValue === null) {
        result.rawError = translate('shared.runtime.cssRecognitionFailed');
        return { ...result, blockedProps: [], hasBlockedProps: false, styles: {} };
      }
      if (containsUnsafeCssSyntax(propValue)) {
        result.rawError = translate('shared.runtime.cssRecognitionFailed');
        return { ...result, blockedProps: [], hasBlockedProps: false, styles: {} };
      }
      const camelPropName = toCamelStyleProperty(declaration.name);

      if (BLOCKED_CSS_PROPS.includes(camelPropName)) {
        result.blockedProps.push(declaration.name);
        result.hasBlockedProps = true;
      } else {
        result.styles[camelPropName] = propValue;
      }
    }
  } catch (e) {
    result.rawError = e instanceof Error ? e.message : translate('shared.runtime.cssParseFailed');
  }

  return result;
}

function resolveRestrictedCssStyles(
  declarations: string,
  allowedProperties: ReadonlySet<string>
): RestrictedCssResolution {
  const validation = validateCssString(declarations);
  if (validation.rawError) return { blockedProps: [], error: 'syntax', styles: {} };
  if (
    Object.values(validation.styles).some(
      (styleValue) => typeof styleValue === 'string' && containsUnsafeCssSyntax(styleValue)
    )
  ) {
    return { blockedProps: [], error: 'unsafe', styles: {} };
  }
  const blockedProps = [
    ...validation.blockedProps,
    ...Object.keys(validation.styles).filter((property) => !allowedProperties.has(property)),
  ];
  return blockedProps.length > 0
    ? { blockedProps: [...new Set(blockedProps)], error: 'blocked', styles: {} }
    : { blockedProps: [], error: null, styles: validation.styles };
}

export function resolveRestrictedCssSections<Target extends string>(args: {
  allowedProperties: Record<Target, ReadonlySet<string>>;
  sections: Record<Target, string[]>;
  targets: readonly Target[];
}): {
  blockedProps: string[];
  error: 'blocked' | 'syntax' | 'unsafe' | null;
  styles: Partial<Record<Target, CSSProperties>>;
} {
  const styles: Partial<Record<Target, CSSProperties>> = {};
  for (const target of args.targets) {
    const declarations = args.sections[target].join('\n').trim();
    if (!declarations) continue;
    const resolved = resolveRestrictedCssStyles(declarations, args.allowedProperties[target]);
    if (resolved.error)
      return { blockedProps: resolved.blockedProps, error: resolved.error, styles: {} };
    styles[target] = resolved.styles;
  }
  return { blockedProps: [], error: null, styles };
}
