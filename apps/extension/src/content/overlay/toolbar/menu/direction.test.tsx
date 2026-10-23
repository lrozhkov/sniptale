// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useToolbarMenuDirection } from './direction';
import { resolveToolbarFloatingMenuStyle, resolveToolbarMenuPlacement } from './floating.helpers';
import { getToolbarMenuPosition } from './position';

afterEach(() => vi.unstubAllGlobals());

it('projects each menu layout after movement and resize, without changing placement policy', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1920);
  vi.stubGlobal('innerHeight', 900);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const anchor = document.createElement('button');
  let bounds = new DOMRect(1580, 500, 36, 36);
  anchor.getBoundingClientRect = () => bounds;
  function Fixture({
    width,
    height,
    mode,
  }: {
    width: number;
    height: number;
    mode: 'horizontal' | 'vertical';
  }) {
    const direction = useToolbarMenuDirection(() => {
      const placement = getToolbarMenuPosition(anchor, height);
      return {
        placement: resolveToolbarMenuPlacement(mode, placement),
        style: resolveToolbarFloatingMenuStyle({
          anchorEl: anchor,
          displayMode: mode,
          menuHeight: height,
          menuWidth: width,
          placement,
        }),
      };
    });
    return <output>{direction}</output>;
  }
  const render = (width: number, height: number, mode: 'horizontal' | 'vertical') =>
    act(() => root.render(<Fixture width={width} height={height} mode={mode} />));
  try {
    render(280, 300, 'vertical');
    expect(host.textContent).toBe('right');
    render(300, 300, 'vertical');
    expect(host.textContent).toBe('left');
    render(280, 300, 'horizontal');
    expect(host.textContent).toBe('down');
    render(300, 380, 'horizontal');
    expect(host.textContent).toBe('up');
    bounds = new DOMRect(30, 30, 36, 36);
    render(300, 380, 'horizontal');
    expect(host.textContent).toBe('down');
    bounds = new DOMRect(30, 500, 36, 36);
    act(() => window.dispatchEvent(new Event('resize')));
    expect(host.textContent).toBe('up');
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

it('waits for an available anchor layout without disabling its trigger', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  function Fixture() {
    const side = useToolbarMenuDirection(() => ({ placement: 'down', style: null }));
    return <button data-menu-side={side}>Open</button>;
  }
  try {
    act(() => root.render(<Fixture />));
    expect(host.querySelector('button')?.getAttribute('data-menu-side')).toBeNull();
    expect(host.querySelector('button')?.disabled).toBe(false);
  } finally {
    act(() => root.unmount());
  }
});
