// @vitest-environment jsdom

import { useRef } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loggerMocks = vi.hoisted(() => ({
  isTraceEnabled: vi.fn(),
  warn: vi.fn(),
}));

const TOOLBAR_EVENT_DIAGNOSTIC_TOGGLE_EVENT = 'sniptale:toolbar-event-diagnostics';

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: vi.fn(() => ({
    child: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: loggerMocks.warn,
  })),
}));

vi.mock('@sniptale/platform/observability/logger/trace-enabled', () => ({
  isTraceEnabled: loggerMocks.isTraceEnabled,
}));

import {
  logToolbarReactActionReached,
  useToolbarEventDeliveryDiagnostics,
} from './event-diagnostics';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function DiagnosticsHarness() {
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  useToolbarEventDeliveryDiagnostics(toolbarRef);

  return <div ref={toolbarRef} data-testid="toolbar" />;
}

async function renderHarness() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<DiagnosticsHarness />);
  });

  return container.querySelector('[data-testid="toolbar"]') as HTMLDivElement;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  loggerMocks.isTraceEnabled.mockReset();
  loggerMocks.warn.mockReset();
});

afterEach(() => {
  window.dispatchEvent(
    new CustomEvent(TOOLBAR_EVENT_DIAGNOSTIC_TOGGLE_EVENT, {
      detail: false,
    })
  );
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function dispatchDiagnosticToggle(enabled: boolean): void {
  window.dispatchEvent(
    new CustomEvent(TOOLBAR_EVENT_DIAGNOSTIC_TOGGLE_EVENT, {
      detail: enabled,
    })
  );
}

function dispatchToolbarClick(toolbar: HTMLElement): void {
  toolbar.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
}

function expectToolbarRootLog(): void {
  expect(loggerMocks.warn).toHaveBeenCalledWith(
    'toolbar-root',
    expect.objectContaining({
      firstPathTarget: 'div',
      type: 'click',
    })
  );
}

function registerTraceGateTests(): void {
  it('does not attach listeners or log actions when trace is disabled', async () => {
    loggerMocks.isTraceEnabled.mockReturnValue(false);
    const toolbar = await renderHarness();

    dispatchToolbarClick(toolbar);
    logToolbarReactActionReached('toggle-mode:cursor');

    expect(loggerMocks.warn).not.toHaveBeenCalled();
  });

  it('logs native event delivery and React actions when trace is enabled', async () => {
    loggerMocks.isTraceEnabled.mockReturnValue(true);
    const toolbar = await renderHarness();

    dispatchToolbarClick(toolbar);
    logToolbarReactActionReached('toggle-mode:cursor');

    expectToolbarRootLog();
    expect(loggerMocks.warn).toHaveBeenCalledWith('react-action', {
      action: 'toggle-mode:cursor',
    });
  });
}

function registerRuntimeToggleTests(): void {
  it('can be enabled from a page-dispatched diagnostic event after mount', async () => {
    loggerMocks.isTraceEnabled.mockReturnValue(false);
    const toolbar = await renderHarness();

    dispatchDiagnosticToggle(true);
    dispatchToolbarClick(toolbar);

    expect(loggerMocks.warn).toHaveBeenCalledWith('diagnostics-toggle', { enabled: true });
    expectToolbarRootLog();
    expect(toolbar.getAttribute('data-sniptale-toolbar-event-diagnostics')).toContain(
      'toolbar-root'
    );
  });
}

describe('toolbar event delivery diagnostics', () => {
  registerTraceGateTests();
  registerRuntimeToggleTests();
});
