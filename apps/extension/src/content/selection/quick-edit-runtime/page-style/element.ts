import { findElementBySelector, findElementBySniptaleId } from '../../../platform/frame';
import type { PageStyleRestoreRule } from '@sniptale/runtime-contracts/page-style';

function resolveByLocator(locator: string): HTMLElement | null {
  try {
    return findElementBySelector(locator);
  } catch {
    return null;
  }
}

function resolveBySniptaleId(sniptaleId?: string): HTMLElement | null {
  if (!sniptaleId) {
    return null;
  }

  try {
    return findElementBySniptaleId(sniptaleId)?.element ?? null;
  } catch {
    return null;
  }
}

export function resolvePageStyleRuleElement(rule: PageStyleRestoreRule): HTMLElement | null {
  return resolveByLocator(rule.selector.locator) ?? resolveBySniptaleId(rule.selector.sniptaleId);
}
