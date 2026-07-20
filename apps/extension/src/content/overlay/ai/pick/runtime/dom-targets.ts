import type { FieldNode, TableNode, TargetRef } from '@sniptale/runtime-contracts/dom-tree';
import type { AiPickElementIndex } from './dom-index';
import {
  findElementByTarget,
  findElementByTargetOrSelector,
} from './target-resolution/target-lookup';

export function getContainingFrameElement(target: HTMLElement): HTMLElement | null {
  if (target.ownerDocument === document) {
    return null;
  }

  return target.ownerDocument.defaultView?.frameElement as HTMLElement | null;
}

function addElementAndParents(
  index: AiPickElementIndex,
  element: HTMLElement,
  dataId: string
): void {
  const existing = index.elementToDataIds.get(element) || new Set<string>();
  existing.add(dataId);
  index.elementToDataIds.set(element, existing);

  let parent: HTMLElement | null = element.parentElement;
  while (parent && parent !== document.body) {
    const parentExisting = index.elementToDataIds.get(parent) || new Set<string>();
    parentExisting.add(dataId);
    index.elementToDataIds.set(parent, parentExisting);
    parent = parent.parentElement;
  }

  const ownerDoc = element.ownerDocument;
  if (ownerDoc === document) {
    return;
  }

  const iframe = ownerDoc.defaultView?.frameElement as HTMLElement | null;
  if (!iframe) {
    return;
  }

  const iframeExisting = index.elementToDataIds.get(iframe) || new Set<string>();
  iframeExisting.add(dataId);
  index.elementToDataIds.set(iframe, iframeExisting);

  let iframeParent = iframe.parentElement;
  while (iframeParent && iframeParent !== document.body) {
    const iframeParentExisting = index.elementToDataIds.get(iframeParent) || new Set<string>();
    iframeParentExisting.add(dataId);
    index.elementToDataIds.set(iframeParent, iframeParentExisting);
    iframeParent = iframeParent.parentElement;
  }
}

function registerPrimaryElement(index: AiPickElementIndex, element: HTMLElement) {
  index.primaryElements.add(element);
}

export function findElementForTarget(nodeId: string, targetRef?: TargetRef): HTMLElement | null {
  return findElementByTarget(nodeId, targetRef);
}

function findElementForFieldTarget(
  nodeId: string,
  targetRef: TargetRef | undefined,
  selector?: string
): HTMLElement | null {
  return findElementByTargetOrSelector(nodeId, targetRef, selector);
}

export function registerFieldElement(index: AiPickElementIndex, field: FieldNode) {
  const fieldElement = findElementForFieldTarget(field.id, field.targetRef, field.selector);
  if (!fieldElement) {
    return;
  }

  registerPrimaryElement(index, fieldElement);
  index.dataIdToElement.set(field.id, fieldElement);
  addElementAndParents(index, fieldElement, field.id);
}

export function registerTableElements(index: AiPickElementIndex, table: TableNode) {
  const tableElement = findElementForTarget(table.id, table.targetRef);
  if (tableElement) {
    registerPrimaryElement(index, tableElement);
    const existing = index.elementToDataIds.get(tableElement) || new Set<string>();
    existing.add(table.id);
    index.elementToDataIds.set(tableElement, existing);
    index.dataIdToElement.set(table.id, tableElement);
  }

  table.rows.forEach((row) => {
    const rowElement = findElementForFieldTarget(row.id, row.targetRef, row.selector);
    if (!rowElement) {
      return;
    }

    registerPrimaryElement(index, rowElement);
    index.dataIdToElement.set(row.id, rowElement);
    addElementAndParents(index, rowElement, row.id);
  });
}
