import type { RootSelectionCandidateSource } from '@sniptale/runtime-contracts/dom-tree';
import type { RootSelectionCandidate } from './types';

const EXCLUDED_CONTAINER_SELECTOR =
  'nav, header, footer, aside, #sniptale-extension-root, #sniptale-extension-root *';
const NAV_HEADING_PATTERN =
  /(related|recommended|popular|trending|most read|search results|more articles|more stories)/i;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function computeLinkDensity(element: HTMLElement, textLength: number): number {
  if (textLength === 0) {
    return 0;
  }

  const anchorTextLength = Array.from(element.querySelectorAll('a[href]')).reduce((sum, anchor) => {
    return sum + (anchor.textContent?.trim().length ?? 0);
  }, 0);

  return Number((anchorTextLength / textLength).toFixed(3));
}

function escapeCssIdentifier(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

export function isSelectableElement(
  element: Element | null,
  source: RootSelectionCandidateSource
): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (
    element.id === 'sniptale-extension-root' ||
    element.closest('#sniptale-extension-root') !== null ||
    (source !== 'hidden-subtree' && element.closest(EXCLUDED_CONTAINER_SELECTOR) !== null)
  ) {
    return false;
  }

  return (element.textContent?.trim().length ?? 0) >= 80;
}

function buildCandidateSelector(root: HTMLElement, element: HTMLElement): string {
  if (element === root) {
    return element.id ? `#${escapeCssIdentifier(element.id)}` : element.tagName.toLowerCase();
  }

  const parts: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current !== root) {
    if (current.id) {
      parts.unshift(`#${escapeCssIdentifier(current.id)}`);
      break;
    }

    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter(
          (child) => child.tagName === current!.tagName
        )
      : [];
    const siblingIndex = siblings.indexOf(current) + 1;
    parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${Math.max(siblingIndex, 1)})`);
    current = current.parentElement;
  }

  return parts.join(' > ');
}

function countNavigationHeadings(element: HTMLElement): number {
  return Array.from(element.querySelectorAll('h1, h2, h3, h4')).filter((heading) => {
    return NAV_HEADING_PATTERN.test(heading.textContent?.trim() ?? '');
  }).length;
}

function isCardGridLike(element: HTMLElement, words: number): boolean {
  if (words > 1200) {
    return false;
  }

  const repeatedCards = Array.from(
    element.querySelectorAll<HTMLElement>(
      'article, li, [class*="card"], [class*="result"], [class*="item"]'
    )
  ).filter((candidate) => {
    if (candidate.closest(EXCLUDED_CONTAINER_SELECTOR) !== null) {
      return false;
    }

    const anchor = candidate.querySelector('a[href]');
    const title = candidate.querySelector('h2, h3, h4') ?? anchor;
    const snippet = Array.from(candidate.querySelectorAll('p, span, div')).find((node) => {
      return (node.textContent?.trim().length ?? 0) >= 40;
    });

    return (
      anchor instanceof HTMLAnchorElement &&
      (title?.textContent?.trim().length ?? 0) >= 12 &&
      snippet !== undefined
    );
  });

  return repeatedCards.length >= 3;
}

function resolveSourceBonus(source: RootSelectionCandidateSource, reasons: string[]): number {
  if (source === 'preferred-root') {
    return 15;
  }

  if (source === 'semantic-root') {
    return 10;
  }

  if (source === 'hidden-subtree') {
    reasons.push('hidden-content');
    return 90;
  }

  if (source === 'schema-text') {
    reasons.push('schema-match');
    return 140;
  }

  reasons.push('fallback');
  return -80;
}

function applyElementBonuses(element: HTMLElement, score: number, reasons: string[]): number {
  let nextScore = score;

  if (element.matches('article, [role="article"]')) {
    nextScore += 25;
    reasons.push('article');
  } else if (element.matches('main, [role="main"]')) {
    nextScore += 12;
    reasons.push('main');
  }

  if (element.querySelector('pre, code, table, math, blockquote, figure, dl')) {
    nextScore += 20;
    reasons.push('structured');
  }

  return nextScore;
}

function applyPenalties(
  element: HTMLElement,
  words: number,
  textLength: number,
  linkDensity: number,
  score: number,
  reasons: string[]
): number {
  let nextScore = score;

  if (countNavigationHeadings(element) > 0) {
    nextScore -= 35;
    reasons.push('nav-headings');
  }

  if (isCardGridLike(element, words)) {
    nextScore -= 140;
    reasons.push('card-grid');
  }

  if (linkDensity > 0.5) {
    nextScore -= 90;
    reasons.push('high-link-density');
  } else if (linkDensity > 0.3) {
    nextScore -= 40;
    reasons.push('elevated-link-density');
  }

  if (words < 30) {
    nextScore -= 50;
    reasons.push('short-content');
  }

  if (textLength < 200) {
    nextScore -= 20;
  }

  return nextScore;
}

export function evaluateCandidate(
  root: HTMLElement,
  element: HTMLElement,
  source: RootSelectionCandidateSource
): RootSelectionCandidate {
  const text = element.textContent?.trim() ?? '';
  const textLength = text.length;
  const words = countWords(text);
  const readableParagraphs = Array.from(element.querySelectorAll('p')).filter((node) => {
    return (node.textContent?.trim().length ?? 0) >= 40;
  }).length;
  const headingCount = element.querySelectorAll('h1, h2, h3').length;
  const commaCount = Math.min((text.match(/,/g) ?? []).length, 12);
  const linkDensity = computeLinkDensity(element, textLength);
  const selector = buildCandidateSelector(root, element);
  const reasons = [`source:${source}`, `text:${textLength}`, `links:${linkDensity.toFixed(3)}`];

  let score = Math.min(words, 400) + readableParagraphs * 18 + headingCount * 8 + commaCount * 2;
  score += resolveSourceBonus(source, reasons);
  score = applyElementBonuses(element, score, reasons);
  score = applyPenalties(element, words, textLength, linkDensity, score, reasons);

  return { element, source, selector, score, textLength, linkDensity, reasons };
}
