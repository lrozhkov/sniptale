import { MVS_BLOCK_SELECTOR } from '../../../../parser/dom-tree-parser/mvs/constants';
import type { AiPickElementIndex } from './dom-index';
import { getContainingFrameElement } from './dom-targets';

function findContainedPrimaryElement(index: AiPickElementIndex, target: HTMLElement) {
  let matchedElement: HTMLElement | null = null;

  index.primaryElements.forEach((element) => {
    if (!target.contains(element) || Object.is(matchedElement, target)) {
      return;
    }

    matchedElement = matchedElement === null ? element : target;
  });

  return Object.is(matchedElement, target) ? null : matchedElement;
}

export function getNearestDataElement(
  index: AiPickElementIndex,
  target: HTMLElement
): HTMLElement | null {
  const groupedTarget = target.closest(MVS_BLOCK_SELECTOR) as HTMLElement | null;
  if (groupedTarget && index.elementToDataIds.has(groupedTarget)) {
    return groupedTarget;
  }

  let current: HTMLElement | null = target;
  const ownerBody = target.ownerDocument.body;
  while (current && current !== ownerBody) {
    if (index.primaryElements.has(current)) {
      return current;
    }

    const containedPrimaryElement = findContainedPrimaryElement(index, current);
    if (containedPrimaryElement) {
      return containedPrimaryElement;
    }

    if (index.elementToDataIds.has(current)) {
      return current;
    }
    current = current.parentElement;
  }

  if (ownerBody && index.elementToDataIds.has(ownerBody)) {
    return ownerBody;
  }

  const iframe = getContainingFrameElement(target);
  return iframe ? getNearestDataElement(index, iframe) : null;
}

function appendDirectDataIds(index: AiPickElementIndex, target: HTMLElement, ids: Set<string>) {
  const direct = index.elementToDataIds.get(target);
  if (direct) {
    direct.forEach((id) => ids.add(id));
  }
}

function appendContainedDataIds(index: AiPickElementIndex, target: HTMLElement, ids: Set<string>) {
  index.elementToDataIds.forEach((dataIds, element) => {
    if (target.contains(element)) {
      dataIds.forEach((id) => ids.add(id));
    }
  });
}

export function getDataIdsForElement(index: AiPickElementIndex, target: HTMLElement): Set<string> {
  const ids = new Set<string>();
  appendDirectDataIds(index, target, ids);
  appendContainedDataIds(index, target, ids);

  const iframe = getContainingFrameElement(target);
  if (iframe) {
    appendDirectDataIds(index, iframe, ids);
    appendContainedDataIds(index, iframe, ids);
  }

  return ids;
}

export function getElementCount(index: AiPickElementIndex): number {
  return index.elementToDataIds.size;
}

export function getDataCount(index: AiPickElementIndex): number {
  return index.dataIdToElement.size;
}
