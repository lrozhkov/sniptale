// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useToolPropertiesPopoverLayout } from './tool-properties-popover-layout';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  { viewportWidth: 1200, toolbarLeft: 560, left: 57, top: 0, maxHeight: 605 },
  { viewportWidth: 719, toolbarLeft: 12, left: -7, top: 57, maxHeight: 548 },
  { viewportWidth: 1200, toolbarLeft: 1140, left: -307, top: 0, maxHeight: 605 },
])('measures toolbar clearance at width $viewportWidth and left $toolbarLeft', (expected) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', expected.viewportWidth);
  vi.stubGlobal('innerHeight', 800);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      return this.tagName === 'BUTTON'
        ? new DOMRect(expected.toolbarLeft + 7, 183, 36, 36)
        : new DOMRect(expected.toolbarLeft, 176, 52, 52);
    }
  );
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let layout: { left: number; top: number; maxHeight: number } | undefined;
  function Harness() {
    const result = useToolPropertiesPopoverLayout(true);
    layout = result.layout;
    return (
      <div className="sniptale-toolbar-root">
        <button ref={result.buttonRef} type="button">
          Settings
        </button>
        <div ref={result.popoverRef}>Options</div>
      </div>
    );
  }
  act(() => root.render(<Harness />));
  expect(layout).toEqual({ left: expected.left, top: expected.top, maxHeight: expected.maxHeight });
  act(() => root.unmount());
  container.remove();
});
