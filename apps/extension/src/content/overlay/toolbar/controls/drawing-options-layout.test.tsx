// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDrawingOptionsLayout, type DrawingQuickOptionsTool } from './drawing-options-layout';

let container: HTMLDivElement;
let root: Root;
let triggerRef: React.RefObject<HTMLButtonElement | null>;
let panelRef: React.RefObject<HTMLDivElement | null>;

function DrawingLayoutHarness(props: {
  preferredPlacement?: 'up' | 'down';
  open: boolean;
  displayMode?: 'horizontal' | 'vertical';
  tool?: DrawingQuickOptionsTool;
  hasSelection?: boolean;
}) {
  const layout = useDrawingOptionsLayout({
    displayMode: props.displayMode ?? 'vertical',
    hasSelection: props.hasSelection ?? false,
    open: props.open,
    panelRef,
    tool: props.tool ?? 'pencil',
    triggerRef,
    ...(props.preferredPlacement ? { preferredPlacement: props.preferredPlacement } : {}),
  });
  const side =
    layout.placement === 'side' ? (layout.style.right ? 'left' : 'right') : layout.placement;
  return <output data-side={side} />;
}

function renderLayout(props: ComponentProps<typeof DrawingLayoutHarness>) {
  act(() => root.render(<DrawingLayoutHarness {...props} />));
  return container.querySelector('output')?.dataset['side'];
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1280);
  vi.stubGlobal('innerHeight', 900);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const trigger = document.createElement('button');
  document.body.appendChild(trigger);
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
    top: 600,
    bottom: 636,
    left: 860,
    right: 896,
    width: 36,
    height: 36,
    x: 860,
    y: 600,
    toJSON: () => ({}),
  });
  triggerRef = { current: trigger };
  const surface = document.createElement('div');
  surface.className = 'sniptale-drawing-options-menu';
  Object.defineProperty(surface, 'offsetWidth', { value: 400 });
  Object.defineProperty(surface, 'offsetHeight', { value: 400 });
  const panel = document.createElement('div');
  surface.appendChild(panel);
  document.body.appendChild(surface);
  panelRef = { current: panel };
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('drawing options measured placement', () => {
  it('prefers above for crop tools and falls back below near the top edge', () => {
    expect(renderLayout({ open: false, displayMode: 'horizontal', preferredPlacement: 'up' })).toBe(
      'up'
    );
    vi.spyOn(triggerRef.current!, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(400, 8, 36, 36)
    );
    expect(renderLayout({ open: false, displayMode: 'horizontal', preferredPlacement: 'up' })).toBe(
      'down'
    );
  });
  it('retains the measured opening side while closed', () => {
    expect(renderLayout({ open: true })).toBe('left');
    expect(renderLayout({ open: false })).toBe('left');
    expect(renderLayout({ open: true })).toBe('left');
  });

  it('uses nominal dimensions after the tool changes while closed', () => {
    expect(renderLayout({ open: true })).toBe('left');
    expect(renderLayout({ open: false, tool: 'marker' })).toBe('right');
  });

  it('uses nominal dimensions after the orientation changes while closed', () => {
    expect(renderLayout({ open: true })).toBe('left');
    expect(renderLayout({ open: false, displayMode: 'horizontal' })).toBe('down');
  });

  it('uses nominal dimensions after selection changes while closed', () => {
    expect(renderLayout({ open: true })).toBe('left');
    expect(renderLayout({ open: false, hasSelection: true })).toBe('right');
  });
});
