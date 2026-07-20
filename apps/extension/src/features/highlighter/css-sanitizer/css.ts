import type { CSSProperties } from 'react';

import { translate } from '../../../platform/i18n';
import { sanitizeHtmlContainer } from '@sniptale/platform/security/sanitizers/html';

function sanitizeCssContainer(cssString: string) {
  const dirtyHtml = `<div style="${cssString}"></div>`;
  const cleanHtml = sanitizeHtmlContainer(dirtyHtml, {
    allowedAttributes: ['style'],
    allowedTags: ['div'],
  });

  return cleanHtml?.querySelector('div') ?? null;
}

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
    const cleanDiv = sanitizeCssContainer(cssString);
    if (!cleanDiv) {
      result.rawError = translate('shared.runtime.cssRecognitionFailed');
      return result;
    }

    const styleDeclaration = cleanDiv.style;

    for (let i = 0; i < styleDeclaration.length; i++) {
      const propName = styleDeclaration[i];
      if (!propName) {
        continue;
      }

      const propValue = styleDeclaration.getPropertyValue(propName);
      const camelPropName = toCamelStyleProperty(propName);

      if (BLOCKED_CSS_PROPS.includes(camelPropName)) {
        result.blockedProps.push(propName);
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
