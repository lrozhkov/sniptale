import { findElementBySelector } from '../../../../../platform/frame';
import { escapeCssIdentifier } from '@sniptale/platform/browser/iframe-selectors/css';
import type { TargetRef } from '@sniptale/runtime-contracts/dom-tree';
import { findElementByTarget } from './target-lookup';

export function findElementWithLegacyFallback(
  nodeId: string,
  targetRef: TargetRef | undefined,
  selector?: string
): HTMLElement | null {
  const targetMatch = findElementByTarget(nodeId, targetRef);
  if (targetMatch) {
    return targetMatch;
  }

  if (selector) {
    const selectorMatch = findElementBySelector(selector);
    if (selectorMatch) {
      return selectorMatch;
    }
  }

  const byId = document.getElementById(nodeId);
  if (byId) {
    return byId;
  }

  const byAttr = document.querySelector(`[data-sniptale-id="${escapeCssIdentifier(nodeId)}"]`);
  return byAttr as HTMLElement | null;
}
