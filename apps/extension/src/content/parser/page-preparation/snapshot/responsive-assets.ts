import { collectWebSnapshotQueryRoots } from '../../../../features/web-snapshot/public';
import { collectOpenShadowQueryRoots } from '../../dom-tree-parser/traversal/virtual-dom.helpers';

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

export function markSelectedResponsiveCandidates(root: ParentNode): Element[] {
  const markedElements: Element[] = [];
  const images = collectOpenShadowQueryRoots(root).flatMap((queryRoot) =>
    Array.from(queryRoot.querySelectorAll<HTMLImageElement>('img[srcset], picture img'))
  );
  for (const image of images) {
    const selectedUrl = resolveSelectedImageUrl(image);
    if (!selectedUrl) {
      continue;
    }

    if (image.hasAttribute('srcset') || image.closest('picture')) {
      image.setAttribute(SELECTED_SRCSET_CANDIDATE_ATTRIBUTE, selectedUrl);
      markedElements.push(image);
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
  const markedElements = collectWebSnapshotQueryRoots(root)
    .flatMap((queryRoot) =>
      Array.from(queryRoot.querySelectorAll(`[${SELECTED_SRCSET_CANDIDATE_ATTRIBUTE}]`))
    )
    .map((element) => ({
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
