// @vitest-environment jsdom

import { act, type CSSProperties, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const layoutMocks = vi.hoisted(() => ({
  calculatePosition: vi.fn(() => ({ x: 30, y: 40, side: 'top' as const })),
  collectExclusions: vi.fn(() => ({ softRects: [], strictRects: [] })),
}));

vi.mock('@sniptale/ui/product-glass-toolbar', () => ({
  ProductGlassToolbar: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock('../layout/portal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../layout/portal')>()),
  getThemedPortalStyle: (_theme: unknown, style: CSSProperties) => style,
  resolveContentPortalTarget: () => document.body,
  Z_INDEX_FLOATING_UI: 100,
}));

vi.mock('../layout/positioning', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../layout/positioning')>()),
  calculateInteractiveFrameToolbarPosition: layoutMocks.calculatePosition,
}));

vi.mock('../layout/floating-placement', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../layout/floating-placement')>()),
  collectFrameFloatingExclusions: layoutMocks.collectExclusions,
}));

import { InteractiveFrameToolbarPortal } from './portal';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('InteractiveFrameToolbarPortal', () => {
  it('ignores other frame geometry when resolving the selected toolbar placement', () => {
    act(() => {
      root.render(
        <InteractiveFrameToolbarPortal
          portalTheme="light"
          toolbarCoords={{ x: 10, y: 20 }}
          frameRect={{ x: 20, y: 140, width: 460, height: 35 }}
          frameId="frame-7"
          anchorOffset={{ x: 14, y: 0 }}
          onWrapperMouseDown={vi.fn()}
          onWrapperClick={vi.fn()}
          onToolbarMouseDown={vi.fn()}
          onToolbarClick={vi.fn()}
        >
          <button type="button">Action</button>
        </InteractiveFrameToolbarPortal>
      );
    });

    expect(layoutMocks.collectExclusions).toHaveBeenCalledWith('frame-7', {
      includeFrameGeometry: false,
    });
    const positioner = document.querySelector('.sniptale-toolbar-portal-wrapper');
    const toolbar = positioner?.querySelector('.sniptale-action-toolbar');
    expect(positioner?.classList).toContain('sniptale-content-ui-positioner');
    expect(toolbar?.classList).toContain('sniptale-content-ui-zoom-surface');
  });
});
