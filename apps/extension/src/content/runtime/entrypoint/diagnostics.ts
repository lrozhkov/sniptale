import { PRODUCT_BRAND_NAME } from '@sniptale/ui/branding';
import { createLogger } from '@sniptale/platform/observability/logger';
import { isTraceEnabled } from '@sniptale/platform/observability/logger/trace-enabled';
import type { Logger } from '@sniptale/platform/observability/logger/types';

type EntrypointLogger = Pick<Logger, 'log'>;

const entrypointDiagnosticsLogger = createLogger({
  namespace: 'ContentEntrypointDiagnostics',
});
const IFRAME_LOAD_TRACE_NAMESPACE = 'ContentEntrypointDiagnostics:IframeLoad';

/**
 * Logs the content-script load event for the top-level document.
 */
export function logTopLevelContentScriptLoad(
  logger: EntrypointLogger = entrypointDiagnosticsLogger
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
  logger: EntrypointLogger = entrypointDiagnosticsLogger
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
