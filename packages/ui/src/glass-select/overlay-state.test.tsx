// @vitest-environment jsdom

import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGlassSelectOverlay } from './overlay-state';

const dismissMock = vi.hoisted(() => vi.fn());
const layoutMock = vi.hoisted(() => vi.fn());

vi.mock('./dismiss', () => ({
  useGlassSelectDismiss: dismissMock,
}));

vi.mock('./layout', () => ({
  useGlassSelectLayout: layoutMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function OverlayHarness(props: {
  setIsOpen: (value: boolean | ((current: boolean) => boolean)) => void;
}) {
  const containerRef = { current: document.createElement('div') };
  const menuRef = { current: document.createElement('div') };
  const { menuPosition, portalStyle } = useGlassSelectOverlay({
    portal: true,
    isOpen: true,
    setIsOpen: props.setIsOpen,
    containerRef,
    menuRef,
  });

  return (
    <div
      data-position={menuPosition}
      data-top={String(portalStyle.top ?? '')}
      data-testid="overlay"
    />
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  dismissMock.mockReset();
  layoutMock.mockReset();
  layoutMock.mockReturnValue({
    menuPosition: 'top',
    portalStyle: { top: 128 },
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useGlassSelectOverlay', () => {
  it('composes dismiss and layout hooks and forwards the returned layout state', () => {
    const setIsOpen = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(<OverlayHarness setIsOpen={setIsOpen} />);
    });

    const overlay = container.querySelector<HTMLElement>('[data-testid="overlay"]');
    const dismissArgs = dismissMock.mock.calls[0]?.[0];

    expect(dismissMock).toHaveBeenCalledTimes(1);
    expect(layoutMock).toHaveBeenCalledTimes(1);
    expect(overlay?.dataset['position']).toBe('top');
    expect(overlay?.dataset['top']).toBe('128');
    dismissArgs.setIsOpen(false);
    expect(setIsOpen).toHaveBeenCalledWith(false);
  });
});
