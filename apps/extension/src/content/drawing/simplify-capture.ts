import { isTrustedPointerEvent } from '../platform/trusted-events';
import { queryAllContentUiElements, resolveContentShadowRoot } from '../platform/dom-host';
import { setUIHidden } from '../selection/locker';
import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ContentRuntimeServices } from '../application/runtime-services/services';
import { readSimplifyPngDimensions } from '../../contracts/messaging/contracts/runtime-message/simplify.types';
import type { DrawingBounds, DrawingSimplifySource } from '../../features/drawing/public';

export interface SimplifySourceCaptureOptions {
  services: ContentRuntimeServices;
  getBounds(): DrawingBounds;
  getRetainedSource?: () => DrawingSimplifySource | null;
  captureViewport?: () => Promise<string>;
}

const CAPTURE_CHROME = [
  '.sniptale-selection-final-overlay',
  '.sniptale-selection-drag-overlay',
  '.sniptale-selection-final-frame',
  '.sniptale-selection-hover-frame',
  '.sniptale-selection-cancel-button',
  '[data-ui="content.drawing.selection-chrome"]',
  '[data-ui="content.drawing.simplify-pending"]',
  '[data-ui="content.drawing.simplify-private"][data-simplify-pending="true"]',
  '[data-ui="content.drawing.simplify-feedback"]',
].join(',');

function concealCaptureChrome(): () => void {
  const hidden = queryAllContentUiElements<HTMLElement>(CAPTURE_CHROME).map((element) => ({
    element,
    value: element.style.getPropertyValue('visibility'),
    priority: element.style.getPropertyPriority('visibility'),
  }));
  for (const { element } of hidden) element.style.setProperty('visibility', 'hidden', 'important');
  return () => {
    for (const { element, value, priority } of hidden) {
      if (
        element.style.getPropertyValue('visibility') !== 'hidden' ||
        element.style.getPropertyPriority('visibility') !== 'important'
      )
        continue;
      if (value) element.style.setProperty('visibility', value, priority);
      else element.style.removeProperty('visibility');
    }
  };
}

function waitForCapture<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}

async function captureWithoutChrome<T>(
  capture: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  signal?.throwIfAborted();
  const alreadyHidden =
    resolveContentShadowRoot()?.host.classList.contains('sniptale-capture-ui-hidden') ??
    document.body.classList.contains('sniptale-capture-ui-hidden');
  if (!alreadyHidden) setUIHidden(true);
  const restoreChrome = concealCaptureChrome();
  try {
    for (let frame = 0; frame < 2; frame += 1)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    signal?.throwIfAborted();
    return await waitForCapture(capture(), signal);
  } finally {
    if (!alreadyHidden) setUIHidden(false);
    restoreChrome();
  }
}

/** Serializes source capture and validates its projection before returning retained pixels. */
export function createSimplifySourceCapture(
  options: SimplifySourceCaptureOptions
): (event: Event, signal?: AbortSignal) => Promise<DrawingSimplifySource> {
  let captureTail: Promise<void> = Promise.resolve();
  return async (event, signal) => {
    signal?.throwIfAborted();
    const retained = options.getRetainedSource?.();
    if (retained) return retained;
    const bounds = options.getBounds();
    const nativeScale = options.captureViewport ? null : window.devicePixelRatio || 1;
    let capture: Promise<string>;
    if (options.captureViewport) {
      if (!isTrustedPointerEvent(event))
        throw new Error('Source acquisition requires a trusted gesture.');
      const captureViewport = options.captureViewport;
      capture = captureTail.then(() => {
        signal?.throwIfAborted();
        return captureViewport();
      });
    } else {
      const intent =
        options.services.contentActionIntent.createTrustedContentActionIntentSource(event);
      if (!intent) throw new Error('Source acquisition requires a trusted gesture.');
      const request = await options.services.contentActionIntent.attachContentActionIntent(
        { type: CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP },
        intent
      );
      capture = captureTail.then(() =>
        captureWithoutChrome(async () => {
          const response = await options.services.messaging.sendRuntimeMessage(request);
          if (!response?.success || typeof response.dataUrl !== 'string')
            throw new Error('Source acquisition failed.');
          return response.dataUrl;
        }, signal)
      );
    }
    captureTail = capture.then(
      () => undefined,
      () => undefined
    );
    const dataUrl = await capture;
    signal?.throwIfAborted();
    const dimensions = readSimplifyPngDimensions(dataUrl);
    const after = options.getBounds();
    if (
      !dimensions ||
      bounds.x !== after.x ||
      bounds.y !== after.y ||
      bounds.width !== after.width ||
      bounds.height !== after.height ||
      (nativeScale !== null && nativeScale !== (window.devicePixelRatio || 1))
    )
      throw new Error('Source acquisition failed.');
    return {
      dataUrl,
      ...dimensions,
      bounds:
        nativeScale === null
          ? bounds
          : {
              x: bounds.x,
              y: bounds.y,
              width: dimensions.width / nativeScale,
              height: dimensions.height / nativeScale,
            },
    };
  };
}
