// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { CommandPressScope } from '../control-language/press';
import {
  ProductGlassBoldButton,
  ProductGlassChip,
  ProductGlassDestructiveButton,
  ProductGlassIconButton,
  ProductGlassInput,
  ProductGlassMiniButton,
  ProductGlassRange,
  ProductGlassRangeMeta,
  ProductGlassSwitch,
} from './buttons';

describe('ProductGlass buttons', () => {
  it('renders canonical state classes for the shared button primitives', () => {
    const markup = renderToStaticMarkup(
      <>
        <ProductGlassIconButton active aria-label="icon" />
        <ProductGlassChip active stacked>
          Chip
        </ProductGlassChip>
        <ProductGlassMiniButton active>Mini</ProductGlassMiniButton>
        <ProductGlassSwitch on aria-label="switch" />
        <ProductGlassRange defaultValue={12} />
        <ProductGlassRangeMeta>Meta</ProductGlassRangeMeta>
        <ProductGlassInput value="value" readOnly />
        <ProductGlassBoldButton active>Bold</ProductGlassBoldButton>
        <ProductGlassDestructiveButton>Delete</ProductGlassDestructiveButton>
      </>
    );

    expect(markup).toContain('sniptale-glass-icon-button--active');
    expect(markup).toContain('sniptale-glass-chip--stacked');
    expect(markup).toContain('sniptale-glass-chip--active');
    expect(markup).toContain('sniptale-glass-mini-button--active');
    expect(markup).toContain('sniptale-glass-switch--on');
    expect(markup).toContain('sniptale-glass-range');
    expect(markup).toContain('sniptale-glass-range-meta');
    expect(markup).toContain('sniptale-glass-input');
    expect(markup).toContain('sniptale-glass-bold-button--active');
    expect(markup).toContain('sniptale-glass-destructive');
    expect(markup).not.toContain('data-command-property');
    expect(markup).not.toContain('sniptale-command-content');
  });

  it('renders glass range fill ratio from min, max, and value', () => {
    const markup = renderToStaticMarkup(
      <ProductGlassRange min={1} max={25} value={20} readOnly style={{ width: '90%' }} />
    );

    expect(markup).toContain('--sniptale-range-fill-ratio:79.2%');
    expect(markup).toContain('width:90%');
  });
});

it('adopts property feedback without changing its ref, accessible state, or cancellation callback', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const ref = createRef<HTMLButtonElement>();
  const onClick = vi.fn();
  const onPointerDown = vi.fn();
  try {
    await act(async () =>
      root.render(
        <CommandPressScope value={true}>
          <ProductGlassBoldButton
            active
            ref={ref}
            aria-label="Align left"
            aria-pressed
            onClick={onClick}
            onPointerDown={onPointerDown}
          >
            <svg aria-hidden="true" />
          </ProductGlassBoldButton>
        </CommandPressScope>
      )
    );
    const button = host.querySelector('button')!;
    expect(ref.current).toBe(button);
    expect(button.getAttribute('aria-label')).toBe('Align left');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.dataset['commandProperty']).toBe('true');
    expect(button.dataset['active']).toBe('true');
    expect(button.querySelector(':scope > .sniptale-command-content > svg')).not.toBeNull();
    const pointer = (type: string) => {
      const event = new MouseEvent(type, { bubbles: true, button: 0, buttons: 1 });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      button.dispatchEvent(event);
    };
    await act(async () => pointer('pointerdown'));
    expect(onPointerDown).toHaveBeenCalledOnce();
    expect(button.dataset['pressing']).toBe('true');
    expect(onClick).not.toHaveBeenCalled();
    await act(async () => {
      pointer('pointercancel');
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    });
    expect(button.dataset['pressing']).toBeUndefined();
    expect(onClick).not.toHaveBeenCalled();
    await act(async () => button.click());
    expect(onClick).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
