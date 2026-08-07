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

function parseCssDeclarations(value: string): CssDeclaration[] | null {
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
  if (probe.length !== 1 || probe.item(0) !== declaration.name) {
    return CHROMIUM_VENDOR_PROPERTIES.has(declaration.name) ? declaration.value : null;
  }
  if (probe.getPropertyPriority(declaration.name)) return null;
  const normalizedValue = probe.getPropertyValue(declaration.name).trim();
  return normalizedValue || null;
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
