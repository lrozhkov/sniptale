import { installDiagnosticPortCapture } from '../platform/runtime-messaging/diagnostic-capture';
import { initTracer } from '@sniptale/platform/observability/message-tracer';
import { initializeTopLevelContentEntry } from './runtime/entrypoint/bootstrap';
import { prepareTranslations } from '../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  registerContentRuntimePreparation,
  runWhenContentBodyReady,
} from './runtime/entrypoint/lifecycle';
import { logIframeContentScriptLoad } from './runtime/entrypoint/diagnostics';

const isTopLevel = window.self === window.top;
// A missing host body retains the existing post-injection readiness budget.
const CONTENT_BODY_READY_TIMEOUT_MS = 2000;

// Initialize tracer when explicitly enabled for diagnostics.
initTracer('cs');
let disposeLogCapture = installDiagnosticPortCapture();
window.addEventListener('pagehide', () => disposeLogCapture());
window.addEventListener('pageshow', (event) => {
  if (event.persisted) disposeLogCapture = installDiagnosticPortCapture();
});

function prepareContentRuntime(): Promise<void> {
  let cancelled = false;
  let cancellationMessage = 'Content runtime preparation cancelled';
  let cancelBodyReadiness: (() => void) | undefined;
  let bodyReadyTimeout: number | undefined;
  let rejectCancellation!: (error: Error) => void;
  const cancellation = new Promise<never>((_, reject) => {
    rejectCancellation = reject;
  });
  const cancel = () => {
    cancelled = true;
    finish();
    window.removeEventListener('pagehide', cancel);
    cancelBodyReadiness?.();
    window.clearTimeout(bodyReadyTimeout);
    rejectCancellation(new Error(cancellationMessage));
  };
  const finish = registerContentRuntimePreparation(cancel);
  window.addEventListener('pagehide', cancel, { once: true });
  const preparation = prepareTranslations('content').then(() => {
    if (cancelled || document.body) return;
    return new Promise<void>((resolve) => {
      cancelBodyReadiness = runWhenContentBodyReady(resolve);
      bodyReadyTimeout = window.setTimeout(() => {
        cancellationMessage = 'Content host body unavailable';
        cancel();
      }, CONTENT_BODY_READY_TIMEOUT_MS);
    });
  });
  return Promise.race([preparation, cancellation]).then(
    () => {
      if (cancelled || !finish()) throw new Error(cancellationMessage);
      window.removeEventListener('pagehide', cancel);
      window.clearTimeout(bodyReadyTimeout);
      initializeTopLevelContentEntry();
    },
    (error: unknown) => {
      if (cancelled || !finish()) throw new Error(cancellationMessage);
      window.removeEventListener('pagehide', cancel);
      window.clearTimeout(bodyReadyTimeout);
      createLogger({ namespace: 'ContentEntrypoint' }).warn(
        'Content translation preparation failed'
      );
      throw error;
    }
  );
}

if (!isTopLevel) logIframeContentScriptLoad(window.location.href);

/** The injection owner awaits catalog preparation and mounting before readiness polling. */
export const contentRuntimePreparation = isTopLevel ? prepareContentRuntime() : Promise.resolve();
// Keep standalone script evaluation free of unhandled rejections. The exported promise still rejects.
void contentRuntimePreparation.catch(() => undefined);
