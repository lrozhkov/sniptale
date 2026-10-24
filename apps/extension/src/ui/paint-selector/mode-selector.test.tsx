// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { GradientTypeSelector, PaintModeSelector } from './mode-selector';

vi.mock('../../platform/i18n', () => ({ translate: (key: string) => key }));

it('separates color, gradient and templates while preserving the selected gradient type', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  const onShowTemplates = vi.fn();
  const render = (
    mode: 'solid' | 'linear' | 'radial' | 'conic',
    activeSection: 'paint' | 'templates' = 'paint'
  ) =>
    act(() =>
      root.render(
        <PaintModeSelector
          activeSection={activeSection}
          mode={mode}
          onChange={onChange}
          onShowTemplates={onShowTemplates}
        />
      )
    );
  try {
    render('solid');
    expect(host.querySelectorAll('button')).toHaveLength(3);
    expect(host.querySelector('[aria-pressed="true"]')?.textContent).toBe(
      'highlighter.paintPicker.solid'
    );
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="highlighter.paintPicker.gradient"]')!
        .click()
    );
    expect(onChange).toHaveBeenLastCalledWith('linear');
    render('linear');
    expect(host.querySelectorAll('button')).toHaveLength(3);
    expect(host.querySelector('[aria-label="highlighter.paintPicker.radial"]')).toBeNull();
    render('radial');
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="highlighter.paintPicker.gradient"]')!
        .click()
    );
    expect(onChange).toHaveBeenLastCalledWith('radial');
    render('radial', 'templates');
    expect(host.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
    expect(host.querySelectorAll('button')).toHaveLength(3);
    act(() => host.querySelector<HTMLButtonElement>('[aria-pressed="true"]')!.click());
    expect(onShowTemplates).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

it('keeps the single supported gradient type implicit', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <PaintModeSelector
          allowedModes={['solid', 'linear']}
          activeSection="paint"
          mode="linear"
          onChange={vi.fn()}
          onShowTemplates={vi.fn()}
        />
      )
    );
    expect(host.querySelectorAll('button')).toHaveLength(3);
    expect(host.querySelector('[aria-label="highlighter.paintPicker.linear"]')).toBeNull();
    expect(host.querySelector('[aria-label="highlighter.paintPicker.radial"]')).toBeNull();
  } finally {
    act(() => root.unmount());
  }
});

it('offers the supported gradient types in the compact gradient-pane selector', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const onChange = vi.fn();
  try {
    act(() => root.render(<GradientTypeSelector mode="linear" onChange={onChange} />));
    expect(host.querySelectorAll('button')).toHaveLength(3);
    expect(host.querySelector('[aria-pressed="true"]')?.getAttribute('aria-label')).toBe(
      'highlighter.paintPicker.linear'
    );
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="highlighter.paintPicker.radial"]')!
        .click()
    );
    expect(onChange).toHaveBeenLastCalledWith('radial');
    act(() =>
      root.render(
        <GradientTypeSelector
          allowedModes={['solid', 'linear']}
          mode="linear"
          onChange={onChange}
        />
      )
    );
    expect(host.querySelector('button')).toBeNull();
  } finally {
    act(() => root.unmount());
  }
});
