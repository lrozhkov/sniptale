import { PRODUCT_BRAND_NAME } from '@sniptale/ui/branding';
import { createLogger } from '@sniptale/platform/observability/logger';
import { isTraceEnabled } from '@sniptale/platform/observability/logger/trace-enabled';
import type { Logger } from '@sniptale/platform/observability/logger/types';

type RegionCaptureMediaDevices = MediaDevices & {
  produceCropTarget?: unknown;
};

type RegionCaptureLogger = Pick<Logger, 'log'>;

type RegionCaptureSnapshot = {
  hasProduceCropTarget: boolean;
  hasCropTo: boolean;
  mediaDevicesType: string;
  cropMediaDeviceKeys: string[];
  cropTrackMethods: string[];
};

const entrypointDiagnosticsLogger = createLogger({
  namespace: 'ContentEntrypointDiagnostics',
});
const IFRAME_LOAD_TRACE_NAMESPACE = 'ContentEntrypointDiagnostics:IframeLoad';

function isCropRelatedKey(key: string): boolean {
  return key.toLowerCase().includes('crop');
}

function collectRegionCaptureSupportSnapshot(args: {
  mediaDevices: MediaDevices;
  mediaStreamTrackPrototype: object;
}): RegionCaptureSnapshot {
  const mediaDevices = args.mediaDevices as RegionCaptureMediaDevices;

  return {
    hasProduceCropTarget: 'produceCropTarget' in mediaDevices,
    hasCropTo: 'cropTo' in args.mediaStreamTrackPrototype,
    mediaDevicesType: typeof args.mediaDevices,
    cropMediaDeviceKeys: Object.keys(args.mediaDevices || {}).filter(isCropRelatedKey),
    cropTrackMethods: Object.getOwnPropertyNames(args.mediaStreamTrackPrototype).filter((key) =>
      isCropRelatedKey(key)
    ),
  };
}

/**
 * Logs the content-script load event for the top-level document.
 */
export function logTopLevelContentScriptLoad(
  logger: RegionCaptureLogger = entrypointDiagnosticsLogger
): void {
  logger.log(
    `%c[${PRODUCT_BRAND_NAME}] Content script loaded in TOP-LEVEL document`,
    'color: green; font-size: 16px; font-weight: bold;'
  );
}

/**
 * Logs the content-script load event for an iframe context.
 */
export function logIframeContentScriptLoad(
  locationHref: string,
  logger: RegionCaptureLogger = entrypointDiagnosticsLogger
): void {
  if (!isTraceEnabled(IFRAME_LOAD_TRACE_NAMESPACE)) {
    return;
  }

  logger.log(
    `%c[${PRODUCT_BRAND_NAME}] Content script loaded in IFRAME:`,
    'color: blue; font-size: 12px;',
    redactIframeLocation(locationHref)
  );
}

function redactIframeLocation(locationHref: string): string {
  try {
    const url = new URL(locationHref);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '';
  }
}

/**
 * Logs Region Capture API diagnostics for the top-level content runtime.
 */
export function logRegionCaptureApiSupport(
  logger: RegionCaptureLogger = entrypointDiagnosticsLogger,
  mediaDevices: MediaDevices = navigator.mediaDevices,
  mediaStreamTrackPrototype: object = MediaStreamTrack.prototype
): void {
  logger.log(
    `%c[${PRODUCT_BRAND_NAME}] Checking Region Capture API support...`,
    'color: blue; font-weight: bold;'
  );

  const snapshot = collectRegionCaptureSupportSnapshot({
    mediaDevices,
    mediaStreamTrackPrototype,
  });

  logger.log(`[${PRODUCT_BRAND_NAME}] API Support Check:`, snapshot);
}
