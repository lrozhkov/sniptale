import type {
  PageProfile,
  RootSelectionCandidateSource,
} from '@sniptale/runtime-contracts/dom-tree';
import { evaluateCandidate, isSelectableElement } from './scoring';
import type { RootSelectionCandidate } from './types';

export const GENERIC_SEMANTIC_ROOT_SELECTORS = [
  'article',
  'main',
  '[role="main"]',
  '.markdown-body',
  '.post-content',
  '.entry-content',
  '.article-content',
  '.content',
  '#content',
] as const;

const HIDDEN_CLASS_PATTERN = /(?:^|\s)(?:hidden|invisible)(?:\s|$)/i;
const HIDDEN_STYLE_PATTERN = /(display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0)/i;

function upsertCandidate(
  candidates: RootSelectionCandidate[],
  candidate: RootSelectionCandidate
): void {
  const existingIndex = candidates.findIndex((item) => item.element === candidate.element);
  if (existingIndex === -1) {
    candidates.push(candidate);
    return;
  }

  const existingCandidate = candidates[existingIndex];
  if (existingCandidate && candidate.score > existingCandidate.score) {
    candidates[existingIndex] = candidate;
  }
}

function collectSelectorCandidates(
  root: HTMLElement,
  profile: PageProfile,
  candidates: RootSelectionCandidate[]
): void {
  const selectorCandidates = Array.from(
    new Set([...profile.preferredRoots, ...GENERIC_SEMANTIC_ROOT_SELECTORS])
  );

  selectorCandidates.forEach((selector) => {
    const source: RootSelectionCandidateSource = profile.preferredRoots.includes(selector)
      ? 'preferred-root'
      : 'semantic-root';

    resolveSelectorMatches(root, selector).forEach((element) => {
      if (!isSelectableElement(element, source)) {
        return;
      }

      upsertCandidate(candidates, evaluateCandidate(root, element, source));
    });
  });
}

function resolveSelectorMatches(root: ParentNode, selector: string): HTMLElement[] {
  const matches: HTMLElement[] = [];

  if (root instanceof HTMLElement && root.matches(selector)) {
    matches.push(root);
  }

  root.querySelectorAll(selector).forEach((element) => {
    if (element instanceof HTMLElement) {
      matches.push(element);
    }
  });

  return matches;
}

function isHiddenCandidate(element: HTMLElement): boolean {
  const style = element.getAttribute('style') ?? '';
  const className = element.getAttribute('class') ?? '';

  return (
    element.hidden ||
    element.getAttribute('aria-hidden') === 'true' ||
    HIDDEN_CLASS_PATTERN.test(className) ||
    HIDDEN_STYLE_PATTERN.test(style)
  );
}

function findLargestHiddenSubtree(root: HTMLElement): HTMLElement | null {
  let bestMatch: HTMLElement | null = null;
  let bestLength = 0;

  root.querySelectorAll<HTMLElement>('*').forEach((candidate) => {
    if (!isSelectableElement(candidate, 'hidden-subtree') || !isHiddenCandidate(candidate)) {
      return;
    }

    const textLength = candidate.textContent?.trim().length ?? 0;
    if (textLength >= 200 && textLength > bestLength) {
      bestMatch = candidate;
      bestLength = textLength;
    }
  });

  return bestMatch;
}

function extractSchemaSearchPhrase(schemaTextHint: string): string {
  const firstParagraph = schemaTextHint
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .find(Boolean);

  return firstParagraph?.slice(0, 100).trim() ?? '';
}

function findSchemaAnchoredSubtree(root: HTMLElement, schemaTextHint?: string): HTMLElement | null {
  if (!schemaTextHint) {
    return null;
  }

  const searchPhrase = extractSchemaSearchPhrase(schemaTextHint);
  const schemaWords = schemaTextHint.trim().split(/\s+/).filter(Boolean).length;
  if (!searchPhrase || schemaWords === 0) {
    return null;
  }

  let bestMatch: HTMLElement | null = null;
  let bestWords = Number.POSITIVE_INFINITY;

  root.querySelectorAll<HTMLElement>('*').forEach((candidate) => {
    if (!isSelectableElement(candidate, 'schema-text')) {
      return;
    }

    const text = candidate.textContent?.trim() ?? '';
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    if (!text.includes(searchPhrase) || words < Math.floor(schemaWords * 0.8)) {
      return;
    }

    if (words < bestWords) {
      bestMatch = candidate;
      bestWords = words;
    }
  });

  return bestMatch;
}

export function buildGenericRootCandidates(
  root: HTMLElement,
  profile: PageProfile,
  schemaTextHint?: string
): RootSelectionCandidate[] {
  const candidates: RootSelectionCandidate[] = [];
  collectSelectorCandidates(root, profile, candidates);

  const hiddenSubtree = findLargestHiddenSubtree(root);
  if (hiddenSubtree) {
    upsertCandidate(candidates, evaluateCandidate(root, hiddenSubtree, 'hidden-subtree'));
  }

  const schemaSubtree = findSchemaAnchoredSubtree(root, schemaTextHint);
  if (schemaSubtree) {
    upsertCandidate(candidates, evaluateCandidate(root, schemaSubtree, 'schema-text'));
  }

  if (
    candidates.length === 0 &&
    !candidates.some((candidate) => candidate.element === root) &&
    isSelectableElement(root, 'fallback-body')
  ) {
    candidates.push(evaluateCandidate(root, root, 'fallback-body'));
  }

  return candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    if (left.textLength !== right.textLength) {
      return left.textLength - right.textLength;
    }

    return left.selector.localeCompare(right.selector);
  });
}
