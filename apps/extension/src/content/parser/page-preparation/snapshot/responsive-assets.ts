export const SELECTED_SRCSET_CANDIDATE_ATTRIBUTE = 'data-sniptale-selected-srcset-candidate';

function resolveSelectedImageUrl(image: HTMLImageElement): string | null {
  if (!image.currentSrc) {
    return null;
  }

  try {
    return new URL(image.currentSrc, image.ownerDocument.baseURI).href;
  } catch {
    return null;
  }
}

function resolveElementAssetUrl(element: Element, value: string): string | null {
  try {
    return new URL(value, element.ownerDocument.baseURI).href;
  } catch {
    return null;
  }
}

function srcsetContainsSelectedUrl(element: Element, selectedUrl: string): boolean {
  const srcset = element.getAttribute('srcset') ?? '';
  return srcset
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/)[0] ?? '')
    .some((candidateUrl) => resolveElementAssetUrl(element, candidateUrl) === selectedUrl);
}

export function markSelectedResponsiveCandidates(root: ParentNode): Element[] {
  const markedElements: Element[] = [];
  for (const image of root.querySelectorAll<HTMLImageElement>('img[srcset], picture img')) {
    const selectedUrl = resolveSelectedImageUrl(image);
    if (!selectedUrl) {
      continue;
    }

    if (image.hasAttribute('srcset') && srcsetContainsSelectedUrl(image, selectedUrl)) {
      image.setAttribute(SELECTED_SRCSET_CANDIDATE_ATTRIBUTE, selectedUrl);
      markedElements.push(image);
    }

    const picture = image.closest('picture');
    if (!picture) {
      continue;
    }

    for (const source of picture.querySelectorAll('source[srcset]')) {
      if (srcsetContainsSelectedUrl(source, selectedUrl)) {
        source.setAttribute(SELECTED_SRCSET_CANDIDATE_ATTRIBUTE, selectedUrl);
        markedElements.push(source);
      }
    }
  }

  return markedElements;
}

export function clearSelectedResponsiveCandidateMarks(markedElements: Element[]): void {
  for (const element of markedElements) {
    element.removeAttribute(SELECTED_SRCSET_CANDIDATE_ATTRIBUTE);
  }
}

export function runWithoutSelectedResponsiveCandidateMarks<T>(root: ParentNode, run: () => T): T {
  const markedElements = Array.from(
    root.querySelectorAll(`[${SELECTED_SRCSET_CANDIDATE_ATTRIBUTE}]`)
  ).map((element) => ({
    element,
    value: element.getAttribute(SELECTED_SRCSET_CANDIDATE_ATTRIBUTE) ?? '',
  }));

  for (const { element } of markedElements) {
    element.removeAttribute(SELECTED_SRCSET_CANDIDATE_ATTRIBUTE);
  }

  try {
    return run();
  } finally {
    for (const { element, value } of markedElements) {
      element.setAttribute(SELECTED_SRCSET_CANDIDATE_ATTRIBUTE, value);
    }
  }
}
