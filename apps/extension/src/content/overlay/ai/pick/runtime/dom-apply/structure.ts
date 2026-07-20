const COMPLEX_STRUCTURE_SELECTOR =
  'img, .colorCircle, .catItemImgView, .stateColWithTitleView, .iconHolder';
const STRUCTURED_TEXT_SELECTOR = [
  '.stringView',
  '.yesNo',
  '.richTextPlainView',
  '.TreeSearchSelectField-EA__value',
  '.TreeSearchSelectField-EA__valueRow',
  '.FormField-EA__control',
  '.FormField-EA__controlBox',
].join(', ');

function hasDirectTextContent(element: HTMLElement): boolean {
  return Array.from(element.childNodes).some((child) => {
    return child.nodeType === Node.TEXT_NODE && child.textContent?.trim();
  });
}

function collapseSingleChildChain(element: HTMLElement): HTMLElement {
  let current = element;

  while (current.children.length === 1 && !hasDirectTextContent(current)) {
    const onlyChild = current.firstElementChild;
    if (!(onlyChild instanceof HTMLElement) || onlyChild.matches(COMPLEX_STRUCTURE_SELECTOR)) {
      break;
    }

    current = onlyChild;
  }

  return current;
}

function findDeepestTextLeaf(element: HTMLElement): HTMLElement | null {
  const descendants = Array.from(element.querySelectorAll<HTMLElement>('*')).reverse();
  return (
    descendants.find((candidate) => {
      return (
        !candidate.matches(COMPLEX_STRUCTURE_SELECTOR) &&
        candidate.children.length === 0 &&
        candidate.textContent?.trim()
      );
    }) ?? null
  );
}

function findTextUpdateTarget(element: HTMLElement): HTMLElement {
  const structuredContainers = Array.from(
    element.querySelectorAll<HTMLElement>(STRUCTURED_TEXT_SELECTOR)
  );
  const structuredContainer = structuredContainers.at(-1);
  if (structuredContainer) {
    return collapseSingleChildChain(structuredContainer);
  }

  return findDeepestTextLeaf(element) ?? collapseSingleChildChain(element);
}

export function updateTextPreservingStructure(element: HTMLElement, newValue: string): void {
  const target = findTextUpdateTarget(element);
  if (target.querySelector(COMPLEX_STRUCTURE_SELECTOR)) {
    return;
  }

  target.textContent = newValue;
}
