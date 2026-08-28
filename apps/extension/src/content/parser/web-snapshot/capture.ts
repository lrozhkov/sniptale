import { sanitizeDiagnosticMessage } from '@sniptale/platform/observability/diagnostics/sanitizer';
import { dataUrlToBlob } from '../../../platform/media-utils/data-url';
import { getContentRuntimeServices } from '../../platform/runtime-services/services';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { translate } from '../../../platform/i18n';
import type { ContentPrivilegedActionIntentSource } from '../../platform/privileged-action-intent/client';
import type { FullPageExportCaptureIdentity } from '../../../contracts/full-page-capture';
import type { FullPageCaptureGeometry } from '../../../contracts/full-page-capture';
import { shouldExcludeWebSnapshotFormControlValue } from '../../../features/web-snapshot/public';
import { isContentOwnedElement } from '../../platform/dom-host';
import { collectOpenShadowQueryRoots } from '../dom-tree-parser/traversal/virtual-dom.helpers';
import { createLogger } from '@sniptale/platform/observability/logger';

const SENSITIVE_CONTROL_MASK_ATTRIBUTE = 'data-sniptale-sensitive-screenshot-mask';
const SENSITIVE_CONTROL_SELECTOR = 'input, select, textarea';
const OPEN_SHADOW_DISCOVERY_INTERVAL_MS = 250;
const logger = createLogger({ namespace: 'ContentWebSnapshot' });

function waitForCaptureResponse<T>(request: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return request;
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new Error('Web snapshot save was cancelled'));
  }
  let removeAbortListener = () => {};
  const cancellation = new Promise<never>((_, reject) => {
    const cancel = () => reject(signal.reason ?? new Error('Web snapshot save was cancelled'));
    signal.addEventListener('abort', cancel, { once: true });
    removeAbortListener = () => signal.removeEventListener('abort', cancel);
  });
  void request.catch(() => undefined);
  return Promise.race([request, cancellation]).finally(removeAbortListener);
}

interface SensitiveControlMask {
  element: HTMLElement;
  priorMarker: string | null;
  styles: SensitiveControlStyleMask[];
}

interface SensitiveControlStyleMask {
  appliedValue: string;
  priorPriority: string;
  priorValue: string;
  property: 'animation' | 'opacity' | 'transition';
}

function maskSensitiveControlsForScreenshot(): () => void {
  const marker = crypto.randomUUID();
  const masks = new Map<HTMLElement, SensitiveControlMask>();
  const observedRoots = new Set<ParentNode>();
  let active = true;

  const createStyleMask = (
    element: HTMLElement,
    property: SensitiveControlStyleMask['property'],
    appliedValue: string
  ): SensitiveControlStyleMask => ({
    appliedValue,
    priorPriority: element.style.getPropertyPriority(property),
    priorValue: element.style.getPropertyValue(property),
    property,
  });

  const maskControl = (element: HTMLElement) => {
    if (!shouldExcludeWebSnapshotFormControlValue(element)) return;
    if (!masks.has(element)) {
      masks.set(element, {
        element,
        priorMarker: element.getAttribute(SENSITIVE_CONTROL_MASK_ATTRIBUTE),
        styles: [
          createStyleMask(element, 'animation', 'none'),
          createStyleMask(element, 'transition', 'none'),
          createStyleMask(element, 'opacity', '0'),
        ],
      });
    }
    if (element.getAttribute(SENSITIVE_CONTROL_MASK_ATTRIBUTE) !== marker) {
      element.setAttribute(SENSITIVE_CONTROL_MASK_ATTRIBUTE, marker);
    }
    for (const style of masks.get(element)?.styles ?? []) {
      if (
        element.style.getPropertyValue(style.property) !== style.appliedValue ||
        element.style.getPropertyPriority(style.property) !== 'important'
      ) {
        element.style.setProperty(style.property, style.appliedValue, 'important');
      }
    }
  };

  const scanControls = (root: ParentNode) => {
    if (root instanceof HTMLElement && root.matches(SENSITIVE_CONTROL_SELECTOR)) maskControl(root);
    for (const control of root.querySelectorAll<HTMLElement>(SENSITIVE_CONTROL_SELECTOR)) {
      maskControl(control);
    }
  };

  const observer = new MutationObserver((records) => {
    if (!active) return;
    for (const record of records) {
      if (record.type === 'attributes') {
        if (
          record.target instanceof HTMLElement &&
          record.target.matches(SENSITIVE_CONTROL_SELECTOR)
        ) {
          maskControl(record.target);
        }
        continue;
      }
      for (const addedNode of record.addedNodes) {
        if (!(addedNode instanceof Element)) continue;
        observeTree(addedNode);
      }
    }
  });

  const observeRoot = (root: ParentNode) => {
    if (observedRoots.has(root)) return;
    observer.observe(root, {
      attributeFilter: [SENSITIVE_CONTROL_MASK_ATTRIBUTE, 'autocomplete', 'style', 'type'],
      attributes: true,
      childList: true,
      subtree: true,
    });
    observedRoots.add(root);
  };

  function observeTree(root: ParentNode, observeContainer = false): void {
    if (observeContainer) observeRoot(root);
    scanControls(root);
    const queryRoots = collectOpenShadowQueryRoots(root);
    for (const queryRoot of queryRoots.slice(1)) {
      observeRoot(queryRoot);
      scanControls(queryRoot);
    }
    if (root instanceof HTMLElement && root.shadowRoot && !isContentOwnedElement(root)) {
      for (const queryRoot of collectOpenShadowQueryRoots(root.shadowRoot)) {
        observeRoot(queryRoot);
        scanControls(queryRoot);
      }
    }
  }

  observeTree(document, true);
  const shadowDiscoveryInterval = setInterval(() => {
    if (!active) return;
    for (const queryRoot of collectOpenShadowQueryRoots(document).slice(1)) {
      if (observedRoots.has(queryRoot)) continue;
      observeRoot(queryRoot);
      scanControls(queryRoot);
    }
  }, OPEN_SHADOW_DISCOVERY_INTERVAL_MS);

  return () => {
    active = false;
    clearInterval(shadowDiscoveryInterval);
    observer.disconnect();
    for (const { element, priorMarker, styles } of masks.values()) {
      if (element.getAttribute(SENSITIVE_CONTROL_MASK_ATTRIBUTE) === marker) {
        if (priorMarker === null) element.removeAttribute(SENSITIVE_CONTROL_MASK_ATTRIBUTE);
        else element.setAttribute(SENSITIVE_CONTROL_MASK_ATTRIBUTE, priorMarker);
      }
      for (const style of styles) {
        if (
          element.style.getPropertyValue(style.property) !== style.appliedValue ||
          element.style.getPropertyPriority(style.property) !== 'important'
        ) {
          continue;
        }
        if (style.priorValue) {
          element.style.setProperty(style.property, style.priorValue, style.priorPriority);
        } else element.style.removeProperty(style.property);
      }
    }
  };
}

export async function captureWebSnapshotScreenshotWithWarnings(
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined,
  captureIdentity: FullPageExportCaptureIdentity = {
    action: MessageType.EXPORT_CAPTURE_FULL_PAGE,
    exportRunId: crypto.randomUUID(),
  },
  abortSignal?: AbortSignal | undefined
): Promise<{ blob: Blob; captureGeometry: FullPageCaptureGeometry; warnings: string[] }> {
  const services = getContentRuntimeServices();
  const restoreSensitiveControls = maskSensitiveControlsForScreenshot();
  let response;
  try {
    const message = await services.contentActionIntent.attachContentActionIntent(
      {
        type: MessageType.EXPORT_CAPTURE_FULL_PAGE,
        exportRunId: captureIdentity.exportRunId,
      },
      contentIntentSource,
      captureIdentity.exportRunId
    );
    response = await waitForCaptureResponse(
      services.messaging.sendRuntimeMessage(message),
      abortSignal
    );
  } finally {
    restoreSensitiveControls();
  }
  if (!response.success || !response.dataUrl || !response.captureGeometry) {
    const message = sanitizeDiagnosticMessage(
      response.error ?? translate('content.runtime.captureFullPageScreenshotFailed')
    );
    throw new Error(message || translate('content.runtime.captureFullPageScreenshotFailed'));
  }
  logger.log('Full-page capture response received', {
    dataUrlBytes: response.dataUrl.length,
  });
  const blob = await dataUrlToBlob(response.dataUrl, abortSignal);
  logger.log('Full-page capture response decoded', { screenshotBytes: blob.size });
  return {
    blob,
    captureGeometry: response.captureGeometry,
    warnings: [
      ...(response.downscaled
        ? [translate('content.runtime.captureFullPageDownscaledWarning')]
        : []),
      ...(response.frozenExtentWarning
        ? [translate('content.runtime.captureFullPageFrozenExtentWarning')]
        : []),
      ...(response.viewportFallback
        ? [translate('content.runtime.captureFullPageViewportFallbackWarning')]
        : []),
    ],
  };
}
