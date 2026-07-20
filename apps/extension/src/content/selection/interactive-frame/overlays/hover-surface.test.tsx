// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCalloutBlurRequestListener } from '../../../platform/page-context/frame-events';
import { InteractiveFrameHoverOverlaySurface } from './hover-surface';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderHarness(options?: { isCalloutEditing?: boolean }) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const props = {
    closePopover: vi.fn(),
    frameId: 'frame-1',
    hideTooltip: vi.fn(),
    isCalloutEditing: options?.isCalloutEditing ?? true,
    isCalloutPopoverOpen: true,
    isPopoverOpen: true,
    isStepBadgePopoverOpen: true,
    portalTheme: null,
    setIsCalloutEditing: vi.fn(),
    setIsCalloutPopoverOpen: vi.fn(),
    setIsStepBadgePopoverOpen: vi.fn(),
  };

  act(() => {
    root?.render(<InteractiveFrameHoverOverlaySurface {...props} />);
  });

  return props;
}

function createRect(args: { bottom: number; left: number; right: number; top: number }): DOMRect {
  return {
    bottom: args.bottom,
    height: args.bottom - args.top,
    left: args.left,
    right: args.right,
    toJSON: () => undefined,
    top: args.top,
    width: args.right - args.left,
    x: args.left,
    y: args.top,
  } as DOMRect;
}

function appendFloatingFixture(className: string, rect: DOMRect) {
  const element = document.createElement('div');
  element.className = className;
  element.getBoundingClientRect = () => rect;
  document.body.append(element);
  return element;
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
    expect(props.closePopover).toHaveBeenCalledTimes(1);
    expect(props.hideTooltip).toHaveBeenCalledWith('frame-1');

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
    expect(props.closePopover).toHaveBeenCalledTimes(1);
    expect(props.hideTooltip).toHaveBeenCalledWith('frame-1');

    cleanup();
  });
});

describe('InteractiveFrameHoverOverlaySurface pointer distance close', () => {
  it('closes hover state when pointer movement leaves the floating UI distance zone', () => {
    const props = renderHarness({ isCalloutEditing: false });
    appendFloatingFixture(
      'sniptale-action-toolbar',
      createRect({ bottom: 40, left: 0, right: 80, top: 0 })
    );

    act(() => {
      document
        .querySelector<HTMLDivElement>('.sniptale-blocking-overlay')
        ?.dispatchEvent(
          new MouseEvent('pointermove', { bubbles: true, clientX: 420, clientY: 420 })
        );
    });

    expect(props.hideTooltip).toHaveBeenCalledWith('frame-1');
  });

  it('keeps callout editing active when pointer movement leaves the floating UI distance zone', () => {
    const listener = vi.fn();
    const cleanup = addCalloutBlurRequestListener(listener);
    const props = renderHarness({ isCalloutEditing: true });
    appendFloatingFixture(
      'sniptale-action-toolbar',
      createRect({ bottom: 40, left: 0, right: 80, top: 0 })
    );

    act(() => {
      document
        .querySelector<HTMLDivElement>('.sniptale-blocking-overlay')
        ?.dispatchEvent(
          new MouseEvent('pointermove', { bubbles: true, clientX: 420, clientY: 420 })
        );
    });

    expect(listener).not.toHaveBeenCalled();
    expect(props.setIsCalloutEditing).not.toHaveBeenCalled();
    expect(props.hideTooltip).not.toHaveBeenCalled();

    cleanup();
  });
});

describe('InteractiveFrameHoverOverlaySurface pointer safe bounds', () => {
  it('keeps hover state while the floating UI bounds are mounting', () => {
    const props = renderHarness({ isCalloutEditing: false });

    act(() => {
      document
        .querySelector<HTMLDivElement>('.sniptale-blocking-overlay')
        ?.dispatchEvent(
          new MouseEvent('pointermove', { bubbles: true, clientX: 420, clientY: 420 })
        );
    });

    expect(props.closePopover).not.toHaveBeenCalled();
    expect(props.hideTooltip).not.toHaveBeenCalled();
  });

  it('keeps hover state when pointer movement stays inside callout settings popover bounds', () => {
    const props = renderHarness({ isCalloutEditing: false });
    appendFloatingFixture(
      'sniptale-callout-settings-popover',
      createRect({ bottom: 470, left: 300, right: 460, top: 300 })
    );

    act(() => {
      document
        .querySelector<HTMLDivElement>('.sniptale-blocking-overlay')
        ?.dispatchEvent(
          new MouseEvent('pointermove', { bubbles: true, clientX: 340, clientY: 340 })
        );
    });

    expect(props.closePopover).not.toHaveBeenCalled();
    expect(props.hideTooltip).not.toHaveBeenCalled();
  });
});
