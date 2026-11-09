import type { ReviewSessionEntry } from './controller';
import type { ContentPrivilegedActionIntentSource } from '../privileged-action-intent';
import { getContentRuntimeServices } from '../runtime-services/services';
import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { cropImage } from '@sniptale/platform/browser/media/image-crop';
import { getAbsolutePosition } from '../../platform/frame';
import { resolveContentShadowRoot } from '../../platform/dom-host';

/** Captures a stable visible target using authority from the current content gesture. */
export async function captureReviewPreview(
  entry: ReviewSessionEntry,
  source: ContentPrivilegedActionIntentSource,
  resolveTarget: (record: ReviewSessionEntry['record']) => Element | null
) {
  const target = resolveTarget(entry.record);
  if (!target) return null;
  const box = getAbsolutePosition(target);
  const x = Math.max(0, box.x - 16),
    y = Math.max(0, box.y - 16);
  const width = Math.min(window.innerWidth, box.x + box.width + 16) - x;
  const height = Math.min(window.innerHeight, box.y + box.height + 16) - y;
  if (width <= 0 || height <= 0 || box.x + box.width <= 0 || box.y + box.height <= 0) return null;
  const services = getContentRuntimeServices();
  // Acquire authority before any asynchronous wait. Storage never grants capture authority.
  const message = await services.contentActionIntent.attachContentActionIntent(
    { type: CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP },
    source
  );
  const host = resolveContentShadowRoot()?.host;
  const element = host instanceof HTMLElement ? host : null;
  const previous = element?.style.getPropertyValue('opacity') ?? '';
  const priority = element?.style.getPropertyPriority('opacity') ?? '';
  try {
    element?.style.setProperty('opacity', '0', 'important');
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
    const response = await services.messaging.sendRuntimeMessage(message);
    if (
      !response.success ||
      !response.dataUrl ||
      !target.isConnected ||
      entry.record.evidence.pageUrl !== location.href
    )
      return null;
    const after = getAbsolutePosition(target);
    if (
      Math.abs(after.x - box.x) > 1 ||
      Math.abs(after.y - box.y) > 1 ||
      Math.abs(after.width - box.width) > 1 ||
      Math.abs(after.height - box.height) > 1
    )
      return null;
    const cropped = await cropImage(response.dataUrl, { x, y, width, height });
    const image = new Image();
    image.src = cropped;
    await image.decode();
    const scale = Math.min(1, 1024 / image.width, 512 / image.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
  } finally {
    if (element?.style.getPropertyValue('opacity') === '0') {
      if (previous) element.style.setProperty('opacity', previous, priority);
      else element.style.removeProperty('opacity');
    }
  }
}
