export const GENERIC_CONTENT_ROOT_SELECTORS = [
  'main article',
  'article',
  'main',
  '[role="main"]',
  '.topic',
  '.topic-content',
  '.content',
  '.markdown-body',
  '.post-content',
  '.entry-content',
  '.article-content',
  '#content',
] as const;

export function queryGenericContentRoot(documentRoot: ParentNode): HTMLElement | null {
  const root = documentRoot.querySelector(GENERIC_CONTENT_ROOT_SELECTORS.join(', '));

  return root instanceof HTMLElement ? root : null;
}

export function countReadableParagraphs(root: ParentNode): number {
  return Array.from(root.querySelectorAll('p')).filter((element) => {
    return (element.textContent?.trim().length ?? 0) >= 40;
  }).length;
}

export function countReadableAnchors(root: ParentNode): number {
  return Array.from(root.querySelectorAll('a[href]')).filter((element) => {
    return (element.textContent?.trim().length ?? 0) >= 12;
  }).length;
}

export function countFormControls(root: ParentNode): number {
  return root.querySelectorAll('input, select, textarea, button').length;
}

export function hasStrongNarrativeSignals(root: HTMLElement): boolean {
  const paragraphCount = countReadableParagraphs(root);
  const headingCount = root.querySelectorAll('h1, h2, h3').length;
  const textLength = root.textContent?.trim().length ?? 0;

  return paragraphCount >= 2 || textLength >= 500 || (headingCount > 0 && textLength >= 200);
}
