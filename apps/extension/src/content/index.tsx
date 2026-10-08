import { installDiagnosticPortCapture } from '../platform/runtime-messaging/diagnostic-capture';
import { initTracer } from '@sniptale/platform/observability/message-tracer';
import { initializeTopLevelContentEntry } from './runtime/entrypoint/bootstrap';
import { logIframeContentScriptLoad } from './runtime/entrypoint/diagnostics';

const isTopLevel = window.self === window.top;

// Initialize tracer when explicitly enabled for diagnostics.
initTracer('cs');
let disposeLogCapture = installDiagnosticPortCapture();
window.addEventListener('pagehide', () => disposeLogCapture());
window.addEventListener('pageshow', (event) => {
  if (event.persisted) disposeLogCapture = installDiagnosticPortCapture();
});

if (isTopLevel) {
  initializeTopLevelContentEntry();
} else {
  logIframeContentScriptLoad(window.location.href);
}
