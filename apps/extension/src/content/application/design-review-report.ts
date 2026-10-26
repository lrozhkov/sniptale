import type { CaptureResponse } from '../../contracts/messaging/contracts/response-types';
import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { cropImage } from '@sniptale/platform/browser/media/image-crop';
import type { createBrowserAnnotationSession } from '../parser/page-preparation/annotations';
import type {
  printReviewReport,
  ReviewReportPreview,
} from '../parser/page-preparation/annotations/format/print';
import { getAbsolutePosition } from '../platform/frame';
import { resolveContentShadowRoot } from '../platform/dom-host';
import type { ContentRuntimeServices } from './runtime-services/services';
import type { ContentPrivilegedActionIntentSource } from './privileged-action-intent';

/** Owns export-time capture only. No raster or preview is written to storage. */
export function createDesignReviewReportExporter(deps: {
  annotations: ReturnType<typeof createBrowserAnnotationSession>;
  services(): ContentRuntimeServices;
  print: typeof printReviewReport;
}) {
  let busy = false;
  return async (title: string, source: ContentPrivilegedActionIntentSource): Promise<void> => {
    if (busy) throw new Error('A review report is already being prepared');
    busy = true;
    const snapshot = deps.annotations.captureSnapshot();
    let invalidated = false;
    const unsubscribe = deps.annotations.subscribe(() => {
      invalidated = true;
    });
    const previews = new Map<number, ReviewReportPreview>();
    const scroll = new Map<Element, { left: number; top: number }>();
    const rootHost = resolveContentShadowRoot()?.host;
    const host = rootHost instanceof HTMLElement ? rootHost : null;
    const opacity = host?.style.getPropertyValue('opacity') ?? '';
    const priority = host?.style.getPropertyPriority('opacity') ?? '';

    let lastCapture = 0;
    try {
      host?.style.setProperty('opacity', '0', 'important');
      for (const record of snapshot.domRecords) {
        const target = deps.annotations.getLiveTarget(record.annotationId);
        if (!target?.isConnected || invalidated) continue;
        try {
          // Save the actual scroll owners before scrollIntoView can change them.
          let node: Element | null = target;
          while (node) {
            if (!scroll.has(node)) scroll.set(node, { left: node.scrollLeft, top: node.scrollTop });
            if (node.assignedSlot) node = node.assignedSlot;
            else if (node.parentElement) node = node.parentElement;
            else {
              const root = node.getRootNode();
              if (root.nodeType === Node.DOCUMENT_FRAGMENT_NODE && 'host' in root) {
                node = (root as ShadowRoot).host;
              } else {
                const view: Window | null = node.ownerDocument.defaultView;
                node = view && view !== window ? view.frameElement : null;
              }
            }
          }
          target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
          await new Promise<void>((resolve) => {
            const fallback = setTimeout(resolve, 100);
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                clearTimeout(fallback);
                resolve();
              })
            );
          });
          // Chrome permits two visible-tab captures per second.
          const delay = Math.max(0, lastCapture + 550 - Date.now());
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
          if (!target.isConnected || invalidated) continue;
          const box = getAbsolutePosition(target);
          const x = Math.max(0, box.x - 16);
          const y = Math.max(0, box.y - 16);
          const width = Math.min(window.innerWidth, box.x + box.width + 16) - x;
          const height = Math.min(window.innerHeight, box.y + box.height + 16) - y;
          if (width <= 0 || height <= 0) continue;
          const services = deps.services();
          let expired = false;
          let deadline: ReturnType<typeof setTimeout> | undefined;
          const requestFrame = async () => {
            const message = await services.contentActionIntent.attachContentActionIntent(
              { type: CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP },
              source
            );
            if (expired) throw new Error('Report capture timed out');
            return services.messaging.sendRuntimeMessage(message);
          };
          let response: CaptureResponse;
          try {
            response = await Promise.race([
              requestFrame(),
              new Promise<never>((_resolve, reject) => {
                deadline = setTimeout(() => {
                  expired = true;
                  reject(new Error('Report capture timed out'));
                }, 10000);
              }),
            ]);
          } finally {
            clearTimeout(deadline);
          }
          lastCapture = Date.now();
          if (!response.success || !response.dataUrl || !target.isConnected || invalidated)
            continue;
          const dataUrl = await cropImage(response.dataUrl, { x, y, width, height });
          if (!invalidated && target.isConnected)
            previews.set(record.annotationId, { dataUrl, width, height });
        } catch {
          // A missing image must not discard accepted feedback.
        }
      }
    } finally {
      for (const [element, position] of scroll) {
        element.scrollLeft = position.left;
        element.scrollTop = position.top;
      }
      if (
        host?.style.getPropertyValue('opacity') === '0' &&
        host.style.getPropertyPriority('opacity') === 'important'
      ) {
        if (opacity) host.style.setProperty('opacity', opacity, priority);
        else host.style.removeProperty('opacity');
      }
      unsubscribe();
      busy = false;
    }
    await deps.print(title, snapshot, {
      previews,
      pageTitle: document.title,
      pageUrl: location.href,
    });
  };
}
