import { escapeCssIdentifier } from '@sniptale/platform/browser/iframe-selectors/css';
import { findElementBySelector } from '../../../platform/frame/selectors';
import { getContainingIframe } from '../../../platform/frame';
import type { PagePreparationSessionSnapshot, PagePreparationHistoryBridge } from './types';

/** Uses structure rather than mutable classes, generated IDs, or edited element text. */
function structuralPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current) {
    const tag = escapeCssIdentifier(current.localName);
    const parent: ParentNode | null = current.parentNode;
    const siblings: Element[] =
      parent && 'children' in parent
        ? Array.from(parent.children).filter((item) => item.localName === current!.localName)
        : [];
    parts.unshift(`${tag}:nth-of-type(${Math.max(1, siblings.indexOf(current) + 1)})`);
    if (current.parentElement) current = current.parentElement;
    else {
      const root = current.getRootNode();
      if (
        root.ownerDocument?.defaultView &&
        root instanceof root.ownerDocument.defaultView.ShadowRoot
      ) {
        parts.unshift('>>>');
        current = root.host;
      } else current = null;
    }
  }
  return parts.join(' > ').replaceAll(' > >>> > ', ' >>> ');
}
/** Captures the exact frame/shadow structure without page-controlled identity attributes. */
export function createRecoveryLocator(element: Element): string {
  const parts = [structuralPath(element)];
  let iframe = getContainingIframe(element);
  while (iframe) {
    parts.unshift(structuralPath(iframe));
    iframe = getContainingIframe(iframe);
  }
  return parts.join(' => ');
}

/** Resolves exactly one target in each retained frame/shadow path; never searches another frame. */
export function resolveRecoveryLocator(locator: string): Element | null {
  const frames = locator.split(' => ');
  if (frames.length > 20) return null;
  let scope: ParentNode = document;
  let target: Element | null = null;
  try {
    for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
      const shadows = frames[frameIndex]!.split(' >>> ');
      for (let shadowIndex = 0; shadowIndex < shadows.length; shadowIndex++) {
        const matches = scope.querySelectorAll(shadows[shadowIndex]!);
        if (matches.length !== 1) return null;
        target = matches.item(0);
        if (shadowIndex < shadows.length - 1) {
          if (!target.shadowRoot) return null;
          scope = target.shadowRoot;
        }
      }
      if (frameIndex < frames.length - 1) {
        const frameTarget: Element | null = target;
        if (!frameTarget) return null;
        const view: (Window & typeof globalThis) | null = frameTarget.ownerDocument.defaultView;
        if (!view || !(frameTarget instanceof view.HTMLIFrameElement)) return null;
        const nextDocument = frameTarget.contentDocument;
        if (!nextDocument) return null;
        scope = nextDocument;
      }
    }
    return target;
  } catch {
    return null;
  }
}

/** Replaces runtime-only selectors while their exact native targets are still retained. */
export function portableSessionSnapshot(
  snapshot: PagePreparationSessionSnapshot,
  bridge: PagePreparationHistoryBridge,
  retained: ReadonlyMap<Element, string>
): PagePreparationSessionSnapshot {
  const next = structuredClone(snapshot);
  for (const frame of next.frameSession.frames) {
    if (!frame.linkedElementSelector) continue;
    const target =
      bridge.resolveRecoveryFrameTarget?.(frame.id) ??
      findElementBySelector(frame.linkedElementSelector);
    if (target)
      frame.linkedElementSelector =
        (target.isConnected ? createRecoveryLocator(target) : retained.get(target)) ??
        frame.linkedElementSelector;
  }
  for (const record of next.annotations.domRecords) {
    const target =
      bridge.resolveRecoveryAnnotationTarget?.(record.annotationId) ??
      findElementBySelector(record.evidence.locator);
    if (!target) continue;
    const locator = target.isConnected ? createRecoveryLocator(target) : retained.get(target);
    if (locator) record.evidence.locator = locator;
    if (target.isConnected) record.evidence.targetSelector = structuralPath(target);
  }
  for (const frame of next.annotations.frameOrders) {
    if (!frame.linkedElementSelector) continue;
    const target =
      bridge.resolveRecoveryFrameTarget?.(frame.frameId) ??
      findElementBySelector(frame.linkedElementSelector);
    if (target)
      frame.linkedElementSelector =
        (target.isConnected ? createRecoveryLocator(target) : retained.get(target)) ??
        frame.linkedElementSelector;
  }
  return next;
}
