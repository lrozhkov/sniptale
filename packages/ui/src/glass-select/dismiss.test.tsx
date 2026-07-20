// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGlassSelectDismiss } from './dismiss';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function DismissHarness(props: { isOpen: boolean; setIsOpen: (value: boolean) => void }) {
  const containerRef = { current: document.getElementById('select-root') as HTMLDivElement | null };
  const menuRef = { current: document.getElementById('menu-root') as HTMLDivElement | null };

  useGlassSelectDismiss({
    isOpen: props.isOpen,
    setIsOpen: props.setIsOpen,
    containerRef,
    menuRef,
  });

  return null;
}

function renderHarness(isOpen: boolean, setIsOpen: (value: boolean) => void) {
  container = document.createElement('div');
  container.innerHTML =
    '<div id="select-root"></div><div id="menu-root"></div><div id="outside"></div>';
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<DismissHarness isOpen={isOpen} setIsOpen={setIsOpen} />);
  });

  return {
    selectRoot: container.querySelector<HTMLElement>('#select-root'),
    menuRoot: container.querySelector<HTMLElement>('#menu-root'),
    outside: container.querySelector<HTMLElement>('#outside'),
  };
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useGlassSelectDismiss', () => {
  it('ignores mousedown events that stay within the select or menu owners', () => {
    const setIsOpen = vi.fn();
    const { menuRoot, selectRoot } = renderHarness(true, setIsOpen);

    act(() => {
      selectRoot?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      menuRoot?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(setIsOpen).not.toHaveBeenCalled();
  });

  it('closes on outside mousedown', () => {
    const setIsOpen = vi.fn();
    renderHarness(true, setIsOpen);

    act(() => {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(setIsOpen).toHaveBeenCalledOnce();
    expect(setIsOpen).toHaveBeenCalledWith(false);
  });
});

describe('useGlassSelectDismiss keyboard handling', () => {
  it('closes on Escape while open', () => {
    const setIsOpen = vi.fn();
    renderHarness(true, setIsOpen);

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });

    expect(setIsOpen).toHaveBeenCalledOnce();
    expect(setIsOpen).toHaveBeenCalledWith(false);
  });
});

describe('useGlassSelectDismiss closed state', () => {
  it('does not react to document events while closed', () => {
    const setIsOpen = vi.fn();
    const { outside } = renderHarness(false, setIsOpen);

    act(() => {
      outside?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });

    expect(setIsOpen).not.toHaveBeenCalled();
  });
});
