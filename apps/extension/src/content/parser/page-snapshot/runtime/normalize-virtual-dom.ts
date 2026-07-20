import type { PageProfile } from '@sniptale/runtime-contracts/dom-tree';

const CALLOUT_SELECTOR = [
  'blockquote',
  '[data-callout]',
  '.callout',
  '.markdown-alert',
  '.alert',
  'aside[class*="callout"]',
].join(', ');

const CODE_SELECTOR = [
  'pre',
  'code',
  '[class*="highlight"]',
  '[class*="language-"]',
  '[class*="code"]',
].join(', ');

export function normalizeGenericVirtualDom(
  virtualRoot: HTMLElement,
  profile: PageProfile
): HTMLElement {
  if (profile.vendor !== 'generic') {
    return virtualRoot;
  }

  virtualRoot.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6').forEach((element) => {
    element.setAttribute('data-sc-normalized-kind', 'heading');
  });

  virtualRoot.querySelectorAll<HTMLElement>('ul, ol').forEach((element) => {
    element.setAttribute('data-sc-normalized-kind', 'list');
  });

  virtualRoot.querySelectorAll<HTMLElement>(CALLOUT_SELECTOR).forEach((element) => {
    const kind = element.matches('blockquote') ? 'quote' : 'callout';
    element.setAttribute('data-sc-normalized-kind', kind);
  });

  virtualRoot.querySelectorAll<HTMLElement>(CODE_SELECTOR).forEach((element) => {
    element.setAttribute('data-sc-normalized-kind', 'code');
  });

  return virtualRoot;
}
