// @vitest-environment jsdom

import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StepBadgePopoverAdapter } from './adapter';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('StepBadgePopoverAdapter', () => {
  it('opts the numbering settings surface into compact density', () => {
    act(() => {
      root.render(
        <StepBadgePopoverAdapter
          anchorEl={null}
          getPopoverStyle={() => ({ position: 'fixed' })}
          isOpen
          popoverRef={createRef<HTMLDivElement>()}
        >
          Numbering settings
        </StepBadgePopoverAdapter>
      );
    });

    expect(
      document
        .querySelector('.sniptale-step-badge-popover')
        ?.classList.contains('sniptale-content-popover--compact')
    ).toBe(true);
    expect(
      document
        .querySelector('.sniptale-step-badge-popover')
        ?.classList.contains('sniptale-content-popover--toolbar-menu')
    ).toBe(true);
  });
});
