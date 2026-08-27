import { sanitizeDiagnosticMessage } from '@sniptale/platform/observability/diagnostics/sanitizer';
import { dataUrlToBlob } from '../../../platform/media-utils/data-url';
import { getContentRuntimeServices } from '../../platform/runtime-services/services';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { translate } from '../../../platform/i18n';
import type { ContentPrivilegedActionIntentSource } from '../../platform/privileged-action-intent/client';
import type { FullPageExportCaptureIdentity } from '../../../contracts/full-page-capture';
import type { FullPageCaptureGeometry } from '../../../contracts/full-page-capture';
import { shouldExcludeWebSnapshotFormControlValue } from '../../../features/web-snapshot/public';
import { collectOpenShadowQueryRoots } from '../dom-tree-parser/traversal/virtual-dom.helpers';

const SENSITIVE_CONTROL_MASK_ATTRIBUTE = 'data-sniptale-sensitive-screenshot-mask';
const SENSITIVE_CONTROL_SELECTOR = 'input, select, textarea';

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
  let scanScheduled = false;

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

  const observer = new MutationObserver(() => {
    if (!active || scanScheduled) return;
    scanScheduled = true;
    queueMicrotask(() => {
      scanScheduled = false;
      if (!active) return;
      scanAll();
    });
  });

  const scanAll = () => {
    for (const root of collectOpenShadowQueryRoots(document)) {
      if (!observedRoots.has(root)) {
        observer.observe(root, {
          attributeFilter: [SENSITIVE_CONTROL_MASK_ATTRIBUTE, 'autocomplete', 'style', 'type'],
          attributes: true,
          childList: true,
          subtree: true,
        });
        observedRoots.add(root);
      }
      for (const control of root.querySelectorAll<HTMLElement>(SENSITIVE_CONTROL_SELECTOR)) {
        maskControl(control);
      }
    }
  };

  scanAll();
  const scanInterval = globalThis.setInterval(scanAll, 16);

  return () => {
    active = false;
    globalThis.clearInterval(scanInterval);
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
  }
): Promise<{ blob: Blob; captureGeometry: FullPageCaptureGeometry; warnings: string[] }> {
  const services = getContentRuntimeServices();
  const restoreSensitiveControls = maskSensitiveControlsForScreenshot();
  let response;
  try {
    response = await services.messaging.sendRuntimeMessage(
      await services.contentActionIntent.attachContentActionIntent(
        {
          type: MessageType.EXPORT_CAPTURE_FULL_PAGE,
          exportRunId: captureIdentity.exportRunId,
        },
        contentIntentSource,
        captureIdentity.exportRunId
      )
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
  return {
    blob: await dataUrlToBlob(response.dataUrl),
    captureGeometry: response.captureGeometry,
    warnings: [
      ...(response.downscaled
        ? [translate('content.runtime.captureFullPageDownscaledWarning')]
        : []),
      ...(response.frozenExtentWarning
        ? [translate('content.runtime.captureFullPageFrozenExtentWarning')]
        : []),
    ],
  };
}
