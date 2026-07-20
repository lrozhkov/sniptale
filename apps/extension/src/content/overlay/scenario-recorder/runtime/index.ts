import { getAbsolutePosition } from '../../../platform/frame/core';
import { createCompositeSelector } from '../../../platform/frame/selectors';
import { isContentOwnedElement } from '../../../platform/dom-host';
import { normalizeHotkeyKey } from '../../../../features/keyboard-shortcuts/hotkeys';
import type {
  ScenarioFramePadding,
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioTargetDescriptor,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import { buildScenarioTargetSemanticFields } from '../../../../features/scenario/capture-step/target-semantics';

export function buildScenarioPageDescriptor(): ScenarioPageDescriptor {
  return {
    title: document.title || null,
    url: window.location.href || null,
    viewport: {
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

export function buildScenarioPoint(x: number, y: number): ScenarioPoint {
  return { x, y };
}

export function buildScenarioTargetDescriptor(
  target: HTMLElement,
  framePadding: ScenarioFramePadding | null = null
): ScenarioTargetDescriptor {
  const selector = createCompositeSelector(target);
  const absoluteRect = getAbsolutePosition(target);

  return {
    ...buildScenarioTargetSemanticFields(target, { ellipsis: '…' }),
    selector: selector.elementSelector,
    iframeSelector: selector.iframeSelector,
    rect: {
      x: absoluteRect.x,
      y: absoluteRect.y,
      width: absoluteRect.width,
      height: absoluteRect.height,
    },
    framePadding,
  };
}

export function isScenarioEligibleInteractionTarget(
  target: HTMLElement | null
): target is HTMLElement {
  if (!target) {
    return false;
  }

  return !isContentOwnedElement(target) && !target.closest('.sniptale-app');
}

export function describeScenarioTarget(target: ScenarioTargetDescriptor | null): string {
  if (!target) {
    return '';
  }

  return target.ariaLabel || target.text || target.title || target.role || target.tagName || '';
}

export function formatShortcutLabel(event: KeyboardEvent): string {
  const parts = [
    event.ctrlKey ? 'Ctrl' : '',
    event.metaKey ? 'Meta' : '',
    event.altKey ? 'Alt' : '',
    event.shiftKey ? 'Shift' : '',
    normalizeHotkeyKey(event.key, event.code),
  ].filter(Boolean);

  return parts.join(' + ');
}
