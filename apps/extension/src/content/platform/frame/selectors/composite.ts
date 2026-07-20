import { getContainingIframe } from '../core';
import { getElementSelector } from '@sniptale/platform/browser/iframe-selectors/element';
import { getIframeSelector } from './iframe';
import type { CompositeSelector } from './types';

export function createCompositeSelector(element: HTMLElement): CompositeSelector {
  const iframe = getContainingIframe(element);
  const elementSelector = getElementSelector(element);

  if (!iframe) {
    return { iframeSelector: null, elementSelector };
  }

  return {
    iframeSelector: getIframeSelector(iframe),
    elementSelector,
  };
}

export function parseCompositeSelector(selector: string): CompositeSelector {
  const parts = selector.split(' => ');
  if (parts.length === 2) {
    const [iframeSelector, elementSelector] = parts;
    if (iframeSelector !== undefined && elementSelector !== undefined) {
      return { iframeSelector, elementSelector };
    }
  }

  return { iframeSelector: null, elementSelector: selector };
}

export function serializeCompositeSelector(composite: CompositeSelector): string {
  return composite.iframeSelector
    ? `${composite.iframeSelector} => ${composite.elementSelector}`
    : composite.elementSelector;
}
