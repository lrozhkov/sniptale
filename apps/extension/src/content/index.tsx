import { initTracer } from '@sniptale/platform/observability/message-tracer';
import { initializeTopLevelContentEntry } from './runtime/entrypoint/bootstrap';
import { logIframeContentScriptLoad } from './runtime/entrypoint/diagnostics';

const isTopLevel = window.self === window.top;

// Initialize tracer when explicitly enabled for diagnostics.
initTracer('cs');

if (isTopLevel) {
  initializeTopLevelContentEntry();
} else {
  logIframeContentScriptLoad(window.location.href);
}
