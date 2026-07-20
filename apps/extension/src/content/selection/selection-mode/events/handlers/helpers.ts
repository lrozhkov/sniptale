import { getContentEventTargetElement } from '../../../../platform/dom-host';
import { resolveIframeEventTarget } from '../../../../platform/frame';
import { logSelectionModeRuntime } from '../../diag';

export function logSelectionModeEvent(eventName: string, details: Record<string, unknown>): void {
  logSelectionModeRuntime(eventName, details);
}

export function getSelectionModeResolvedTagName(
  event: MouseEvent,
  iframe?: HTMLIFrameElement
): string | undefined {
  return (resolveIframeEventTarget(event, iframe) ?? getContentEventTargetElement(event))?.tagName;
}
