// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlassPopover, GlassSection } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('GlassPopover', () => {
  it('keeps theme-scoped style, data-ui defaults, and stops wrapper propagation', () => {
    const onWrapperClick = vi.fn();
    const onWrapperMouseDown = vi.fn();

    act(() => {
      root?.render(
        <div onClick={onWrapperClick} onMouseDown={onWrapperMouseDown}>
          <GlassPopover theme="dark" className="custom-popover">
            <GlassSection title="Section title">Body</GlassSection>
          </GlassPopover>
        </div>
      );
    });

    const popover = container?.querySelector<HTMLDivElement>('.sniptale-glass-popover');
    const section = container?.querySelector<HTMLElement>('section');

    expect(popover?.getAttribute('data-ui')).toBe('shared.ui.glass-popover');
    expect(popover?.getAttribute('data-theme')).toBe('dark');
    expect(popover?.style.colorScheme).toBe('dark');
    expect(popover?.className).toContain('custom-popover');
    expect(section?.getAttribute('data-ui')).toBe('shared.ui.glass-section');
    expect(container?.textContent).toContain('Section title');

    act(() => {
      popover?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      popover?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onWrapperMouseDown).not.toHaveBeenCalled();
    expect(onWrapperClick).not.toHaveBeenCalled();
  });
});
