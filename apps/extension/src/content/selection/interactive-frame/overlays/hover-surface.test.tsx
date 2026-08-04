// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCalloutBlurRequestListener } from '../../../platform/page-context/frame-events';
import { InteractiveFrameHoverOverlaySurface } from './hover-surface';
import { Z_INDEX_CALLOUT_EDITING } from '../layout/portal';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const props = {
    frameId: 'frame-1',
    clearSelection: vi.fn(),
    isCalloutEditing: true,
    portalTheme: null,
    setIsCalloutEditing: vi.fn(),
  };

  act(() => {
    root?.render(<InteractiveFrameHoverOverlaySurface {...props} />);
  });

  return props;
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
  document.body.replaceChildren();
});

describe('InteractiveFrameHoverOverlaySurface', () => {
  it('stays below editable callout content so text remains selectable', () => {
    renderHarness();

    const overlay = document.querySelector<HTMLDivElement>('.sniptale-blocking-overlay');
    expect(overlay?.style.zIndex).toBe(String(Z_INDEX_CALLOUT_EDITING - 1));
  });

  it('dispatches callout blur requests through the shared event seam on mousedown', () => {
    const listener = vi.fn();
    const cleanup = addCalloutBlurRequestListener(listener);
    const props = renderHarness();

    act(() => {
      document
        .querySelector<HTMLDivElement>('.sniptale-blocking-overlay')
        ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(listener).toHaveBeenCalledWith({ frameId: 'frame-1' });
    expect(props.setIsCalloutEditing).toHaveBeenCalledWith(false);
    expect(props.clearSelection).toHaveBeenCalledOnce();

    cleanup();
  });

  it('closes hover state on pointerdown before host pages can cancel mousedown', () => {
    const listener = vi.fn();
    const cleanup = addCalloutBlurRequestListener(listener);
    const props = renderHarness();

    act(() => {
      document
        .querySelector<HTMLDivElement>('.sniptale-blocking-overlay')
        ?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    });

    expect(listener).toHaveBeenCalledWith({ frameId: 'frame-1' });
    expect(props.setIsCalloutEditing).toHaveBeenCalledWith(false);
    expect(props.clearSelection).toHaveBeenCalledOnce();

    cleanup();
  });
});
