import {
  CONTENT_APP_CONTAINER_ID,
  CONTENT_OVERLAY_ROOT_ID,
  CONTENT_ROOT_ID,
} from '@sniptale/ui/branding';
import { resolveContentShadowRoot } from '../../../../../platform/dom-host';
import { createLogger } from '@sniptale/platform/observability/logger';

const AI_PICK_SHADOW_SCAFFOLD_IDS = new Set([
  CONTENT_ROOT_ID,
  CONTENT_APP_CONTAINER_ID,
  CONTENT_OVERLAY_ROOT_ID,
]);
const AI_PICK_FRAME_CONTAINER_ID_PREFIX = 'frame-container-';
const logger = createLogger({ namespace: 'ContentAiPickTarget' });

export function isAiPickShadowScaffoldElement(target: HTMLElement): boolean {
  return (
    AI_PICK_SHADOW_SCAFFOLD_IDS.has(target.id) ||
    target.id.startsWith(AI_PICK_FRAME_CONTAINER_ID_PREFIX)
  );
}

function getAiPickShadowPointTargets(event: MouseEvent): HTMLElement[] {
  const shadowRoot = resolveContentShadowRoot() as
    | (ShadowRoot & {
        elementFromPoint?: (x: number, y: number) => Element | null;
        elementsFromPoint?: (x: number, y: number) => Element[];
      })
    | null;
  if (!shadowRoot) {
    return [];
  }

  const shadowTargets =
    shadowRoot.elementsFromPoint?.(event.clientX, event.clientY) ??
    (shadowRoot.elementFromPoint?.(event.clientX, event.clientY)
      ? [shadowRoot.elementFromPoint(event.clientX, event.clientY)!]
      : []);

  return shadowTargets.filter((target): target is HTMLElement =>
    Boolean(target && target.nodeType === Node.ELEMENT_NODE)
  );
}

export function resolveAiPickShadowPointTarget(event: MouseEvent): HTMLElement | null {
  return (
    getAiPickShadowPointTargets(event).find((target) => !isAiPickShadowScaffoldElement(target)) ??
    null
  );
}

export function logAiPickShadowPierceMiss(event: MouseEvent, target: HTMLElement): void {
  logger.debug('Shadow pierce miss', {
    eventTarget: `${target.tagName.toLowerCase()}#${target.id}.${target.className}`,
    clientX: event.clientX,
    clientY: event.clientY,
  });
}
