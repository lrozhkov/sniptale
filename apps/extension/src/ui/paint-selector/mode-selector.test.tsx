// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { PaintModeSelector } from './mode-selector';

it('exposes the selected paint or template mode without changing command callbacks', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  const onShowTemplates = vi.fn();
  try {
    act(() =>
      root.render(
        <PaintModeSelector
          activeSection="paint"
          mode="linear"
          onChange={onChange}
          onShowTemplates={onShowTemplates}
        />
      )
    );
    const selected = host.querySelector<HTMLButtonElement>('[aria-pressed="true"]')!;
    expect(host.querySelector('.paint-selector-modes')).not.toBeNull();
    expect(selected.classList.contains('sniptale-glass-icon-button--active')).toBe(true);
    act(() => selected.click());
    expect(onChange).toHaveBeenCalledExactlyOnceWith('linear');
    act(() =>
      root.render(
        <PaintModeSelector
          activeSection="templates"
          mode="linear"
          onChange={onChange}
          onShowTemplates={onShowTemplates}
        />
      )
    );
    expect(host.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
    act(() => host.querySelector<HTMLButtonElement>('[aria-pressed="true"]')!.click());
    expect(onShowTemplates).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
