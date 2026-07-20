import { findElementBySelector, findElementBySniptaleId } from '../../../../../platform/frame';
import { escapeCssIdentifier } from '@sniptale/platform/browser/iframe-selectors/css';
import type { TargetRef } from '@sniptale/runtime-contracts/dom-tree';

export function findElementByTarget(nodeId: string, targetRef?: TargetRef): HTMLElement | null {
  if (targetRef?.sniptaleId) {
    const sniptaleResult = findElementBySniptaleId(targetRef.sniptaleId);
    if (sniptaleResult) {
      return sniptaleResult.element;
    }
  }

  for (const selector of targetRef?.selectors ?? []) {
    const selectorResult = findElementBySelector(selector);
    if (selectorResult) {
      return selectorResult;
    }
  }

  const sniptaleResult = findElementBySniptaleId(nodeId);
  if (sniptaleResult) {
    return sniptaleResult.element;
  }

  const byId = document.getElementById(nodeId);
  if (byId) {
    return byId;
  }

  const byAttr = document.querySelector(`[data-sniptale-id="${escapeCssIdentifier(nodeId)}"]`);
  return byAttr as HTMLElement | null;
}

export function findElementByTargetOrSelector(
  nodeId: string,
  targetRef?: TargetRef,
  selector?: string
): HTMLElement | null {
  const targetMatch = findElementByTarget(nodeId, targetRef);
  if (targetMatch) {
    return targetMatch;
  }

  if (!selector) {
    return null;
  }

  return findElementBySelector(selector);
}
