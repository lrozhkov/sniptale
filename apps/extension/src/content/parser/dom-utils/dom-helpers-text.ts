import { createLazyDefaultOwner as createLazyContentDefaultOwner } from '@sniptale/foundation/default-owner';
import { createDomHelpersTextResolverController } from './dom-helpers-text-resolver.controller';

const NARRATIVE_HIDDEN_CLASS_PATTERN = /(?:^|\s)(?:hidden|invisible)(?:\s|$)/i;
const NARRATIVE_HIDDEN_STYLE_PATTERN =
  /(display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0)/i;
const NARRATIVE_IGNORED_SELECTOR = [
  'script',
  'style',
  'template',
  'noscript',
  'input',
  'select',
  'textarea',
  'button',
  'svg',
  'canvas',
  'iframe',
].join(', ');
const domHelpersTextResolverControllerOwner = createLazyContentDefaultOwner(
  createDomHelpersTextResolverController
);

export function setGetOriginalElementFn(fn: ((node: Node) => Node | null) | null): void {
  domHelpersTextResolverControllerOwner.getOwner().setResolver(fn);
}

export function extractCleanText(element: HTMLElement): string {
  if (!element) return '';

  for (const child of element.childNodes) {
    if (child.nodeType !== Node.TEXT_NODE) {
      continue;
    }

    const text = child.textContent?.trim();
    if (text) {
      return text;
    }
  }

  return element.textContent?.trim() || '';
}

function normalizeCompositeText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isNarrativeHiddenElement(element: HTMLElement): boolean {
  const style = element.getAttribute('style') ?? '';
  const className = element.getAttribute('class') ?? '';

  return (
    element.hidden ||
    element.getAttribute('aria-hidden') === 'true' ||
    NARRATIVE_HIDDEN_CLASS_PATTERN.test(className) ||
    NARRATIVE_HIDDEN_STYLE_PATTERN.test(style)
  );
}

function normalizeNarrativeClone(clone: HTMLElement): void {
  clone.querySelectorAll('br').forEach((lineBreak) => lineBreak.replaceWith('\n'));

  clone.querySelectorAll<HTMLElement>('*').forEach((element) => {
    if (element.matches(NARRATIVE_IGNORED_SELECTOR) || isNarrativeHiddenElement(element)) {
      element.remove();
    }
  });
}

export function extractCompositeText(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('br').forEach((lineBreak) => lineBreak.replaceWith('\n'));
  return normalizeCompositeText(clone.textContent || '');
}

export function extractNarrativeText(element: HTMLElement): string {
  if (!element || isNarrativeHiddenElement(element)) {
    return '';
  }

  const clone = element.cloneNode(true) as HTMLElement;
  normalizeNarrativeClone(clone);
  return normalizeCompositeText(clone.textContent || '');
}

export function extractLinkText(element: HTMLElement): { text: string; href?: string } {
  if (element.tagName.toLowerCase() === 'a') {
    return { href: (element as HTMLAnchorElement).href, text: extractCompositeText(element) };
  }

  const links = Array.from(element.querySelectorAll('a'));
  if (links.length === 1) {
    const [link] = links;
    const text = extractCompositeText(element);
    const linkText = extractCompositeText(link as HTMLElement);
    return text && text !== linkText
      ? { text }
      : { href: (link as HTMLAnchorElement).href, text: linkText || text };
  }

  if (links.length > 1) {
    return { text: extractCompositeText(element) };
  }

  return { text: extractCleanText(element) };
}

export function extractImageText(element: HTMLElement): string {
  const img = element.querySelector('img');
  if (img) {
    return img.alt || img.title || element.title || extractCleanText(element);
  }

  return element.title || extractCleanText(element);
}

export function determineValueType(
  element: HTMLElement
): 'string' | 'link' | 'number' | 'boolean' | 'image' | 'status' {
  if (containsStatusIndicator(element)) {
    return 'status';
  }

  if (containsImageOnly(element)) {
    return 'image';
  }

  if (element.querySelector('a') || element.tagName.toLowerCase() === 'a') {
    return 'link';
  }

  const text = extractCleanText(element);
  if (/^\d+$/.test(text)) {
    return 'number';
  }

  if (/^(да|нет|true|false|вкл|выкл)$/i.test(text)) {
    return 'boolean';
  }

  return 'string';
}

export function setSniptaleId(element: HTMLElement, id: string): void {
  domHelpersTextResolverControllerOwner.getOwner().assignSniptaleId(element, id);
}

function containsImageOnly(element: HTMLElement): boolean {
  const img = element.querySelector('img');
  if (!img) return false;

  if (img.classList.contains('catItemIconAsThumbnail') || img.classList.contains('icon')) {
    return true;
  }

  const link = element.querySelector('a');
  if (!link) {
    return false;
  }

  if (link.querySelector('.catItemImgView')) {
    return true;
  }

  return !link.querySelector('.stringView, .yesNo, .richTextPlainView, .stateColWithTitleView');
}

function containsStatusIndicator(element: HTMLElement): boolean {
  if (!element.querySelector('.colorCircle')) {
    return false;
  }

  return Boolean(element.querySelector('.stateColWithTitleView, .catItemCircleAndTitle'));
}
