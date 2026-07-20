import { useEffect, type RefObject } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { isTraceEnabled } from '@sniptale/platform/observability/logger/trace-enabled';

const TOOLBAR_EVENT_TYPES = ['pointerdown', 'mousedown', 'click'] as const;
const TOOLBAR_EVENT_DIAGNOSTIC_NAMESPACE = 'ContentToolbarEventDelivery';
const TOOLBAR_EVENT_DIAGNOSTIC_TOGGLE_EVENT = 'sniptale:toolbar-event-diagnostics';

const logger = createLogger({
  namespace: TOOLBAR_EVENT_DIAGNOSTIC_NAMESPACE,
  traceEnabled: true,
});

let diagnosticsForced = false;
let diagnosticsRecordTarget: HTMLElement | null = null;
let diagnosticsSequence = 0;

function emitToolbarDiagnostic(...args: unknown[]): void {
  if (!isToolbarEventTraceEnabled()) {
    return;
  }

  writeToolbarDiagnosticRecord(args);
  (logger as Partial<Pick<typeof logger, 'warn'>>).warn?.(...args);
}

function isToolbarEventTraceEnabled(): boolean {
  return diagnosticsForced || isTraceEnabled(TOOLBAR_EVENT_DIAGNOSTIC_NAMESPACE);
}

function resolveDiagnosticToggle(event: Event): boolean {
  if (!(event instanceof CustomEvent)) {
    return true;
  }

  const detail: unknown = event.detail;
  if (typeof detail === 'boolean') {
    return detail;
  }

  if (detail && typeof detail === 'object' && 'enabled' in detail) {
    return (detail as { enabled?: unknown }).enabled === true;
  }

  return true;
}

function getPathLabel(event: Event): string | null {
  if (typeof event.composedPath !== 'function') {
    return null;
  }

  const first = event.composedPath()[0];
  if (!(first instanceof Element)) {
    return null;
  }

  const id = first.id ? `#${first.id}` : '';
  const className = typeof first.className === 'string' ? first.className.trim() : '';
  const classes = className ? `.${className.split(/\s+/).slice(0, 4).join('.')}` : '';
  return `${first.tagName.toLowerCase()}${id}${classes}`;
}

function writeToolbarDiagnosticRecord(args: unknown[]): void {
  diagnosticsSequence += 1;
  diagnosticsRecordTarget?.setAttribute(
    'data-sniptale-toolbar-event-diagnostics',
    JSON.stringify({
      args,
      sequence: diagnosticsSequence,
    })
  );
}

function isToolbarPathEvent(event: Event, toolbarRoot: HTMLElement): boolean {
  if (typeof event.composedPath !== 'function') {
    return event.target === toolbarRoot;
  }

  return event.composedPath().includes(toolbarRoot);
}

function logToolbarEvent(scope: string, event: Event): void {
  emitToolbarDiagnostic(scope, {
    cancelBubble: event.cancelBubble,
    defaultPrevented: event.defaultPrevented,
    eventPhase: event.eventPhase,
    firstPathTarget: getPathLabel(event),
    type: event.type,
  });
}

function addDiagnosticListeners(
  scope: string,
  target: EventTarget | null,
  toolbarRoot: HTMLElement,
  cleanupFns: Array<() => void>
): void {
  if (!target) {
    return;
  }

  for (const eventType of TOOLBAR_EVENT_TYPES) {
    const listener = (event: Event) => {
      if (isToolbarPathEvent(event, toolbarRoot)) {
        logToolbarEvent(scope, event);
      }
    };
    target.addEventListener(eventType, listener, { capture: true });
    cleanupFns.push(() => target.removeEventListener(eventType, listener, { capture: true }));
  }
}

function addDiagnosticToggleListener(cleanupFns: Array<() => void>): void {
  const listener = (event: Event) => {
    diagnosticsForced = resolveDiagnosticToggle(event);
    emitToolbarDiagnostic('diagnostics-toggle', { enabled: diagnosticsForced });
  };

  window.addEventListener(TOOLBAR_EVENT_DIAGNOSTIC_TOGGLE_EVENT, listener);
  cleanupFns.push(() =>
    window.removeEventListener(TOOLBAR_EVENT_DIAGNOSTIC_TOGGLE_EVENT, listener)
  );
}

export function useToolbarEventDeliveryDiagnostics(
  toolbarRef: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    const toolbarRoot = toolbarRef.current;
    const rootNode = toolbarRoot?.getRootNode();
    const shadowHost = rootNode instanceof ShadowRoot ? rootNode.host : null;
    const cleanupFns: Array<() => void> = [];

    addDiagnosticToggleListener(cleanupFns);
    if (!toolbarRoot) {
      return () => {
        cleanupFns.forEach((cleanup) => cleanup());
      };
    }

    diagnosticsRecordTarget = shadowHost instanceof HTMLElement ? shadowHost : toolbarRoot;
    addDiagnosticListeners('window', window, toolbarRoot, cleanupFns);
    addDiagnosticListeners('document', document, toolbarRoot, cleanupFns);
    addDiagnosticListeners('shadow-host', shadowHost, toolbarRoot, cleanupFns);
    addDiagnosticListeners('toolbar-root', toolbarRoot, toolbarRoot, cleanupFns);

    return () => {
      if (diagnosticsRecordTarget === shadowHost || diagnosticsRecordTarget === toolbarRoot) {
        diagnosticsRecordTarget = null;
      }
      cleanupFns.forEach((cleanup) => cleanup());
    };
  }, [toolbarRef]);
}

export function logToolbarReactActionReached(action: string): void {
  emitToolbarDiagnostic('react-action', { action });
}
