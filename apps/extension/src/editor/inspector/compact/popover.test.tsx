// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import { EditorInspectorCompactPopover } from './popover';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderPopover(onClose = vi.fn()) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <EditorInspectorCompactPopover
        title="Inspector"
        value="42px"
        trigger={<span>Trigger</span>}
        style={{ top: 24, left: 12, position: 'fixed' }}
        popoverRef={{ current: null }}
        onClose={onClose}
      >
        <div>Popover body</div>
      </EditorInspectorCompactPopover>
    );
  });

  return onClose;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

function runPortalRenderSuite() {
  it('renders into the body portal with compact surface metadata and header copy', () => {
    renderPopover();

    const popover = document.body.querySelector<HTMLElement>(
      '[data-ui="editor.inspector.compact-popover"]'
    );

    expect(popover).not.toBeNull();
    expect(popover?.textContent).toContain('Inspector');
    expect(popover?.textContent).toContain('42px');
    expect(popover?.textContent).toContain('Popover body');
    expect(popover?.style.top).toBe('24px');
    expect(popover?.style.left).toBe('12px');
  });

  it('wires the shared close affordance to the popover close handler', () => {
    const onClose = renderPopover();
    const closeButton = document.body.querySelector<HTMLButtonElement>(
      '[aria-label="editor.runtime.closePopoverAria"]'
    );

    act(() => {
      closeButton?.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
}

function runOptionalValueSuite() {
  function verifyOptionalValueRow(value?: string) {
    if (!container) {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    }

    act(() => {
      root?.render(
        <EditorInspectorCompactPopover
          title="Inspector"
          {...(value === undefined ? {} : { value })}
          trigger={<span>Trigger</span>}
          style={{ top: 24, left: 12, position: 'fixed' }}
          popoverRef={{ current: null }}
          onClose={vi.fn()}
        >
          <div>Popover body</div>
        </EditorInspectorCompactPopover>
      );
    });

    const popover = document.body.querySelector<HTMLElement>(
      '[data-ui="editor.inspector.compact-popover"]'
    );

    expect(popover?.textContent).toContain('Inspector');
    expect(popover?.textContent).not.toContain('42px');
  }

  it('omits the secondary value row when the compact popover has no value', () => {
    verifyOptionalValueRow();
  });

  it('keeps the secondary value row hidden for an explicit empty string value', () => {
    verifyOptionalValueRow('');
  });
}

function runDocumentGuardSuite() {
  it('returns null when document is unavailable', () => {
    const originalDocument = globalThis.document;

    vi.stubGlobal('document', undefined);

    const result = EditorInspectorCompactPopover({
      title: 'Inspector',
      trigger: <span>Trigger</span>,
      style: { top: 24, left: 12, position: 'fixed' },
      popoverRef: { current: null },
      onClose: vi.fn(),
      children: <div>Popover body</div>,
    });

    expect(result).toBeNull();

    vi.stubGlobal('document', originalDocument);
  });
}

describe('EditorInspectorCompactPopover', () => {
  runPortalRenderSuite();
  runOptionalValueSuite();
  runDocumentGuardSuite();
});
