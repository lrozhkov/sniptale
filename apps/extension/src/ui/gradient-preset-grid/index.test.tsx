// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ProductGradientPresetGrid, type ProductGradientPreset } from './index';

const PRESETS: ProductGradientPreset[] = [
  { angle: 45, from: '#111111', id: 'match', label: 'Match', to: '#222222' },
  { angle: 90, from: '#333333', id: 'other', label: 'Other', to: '#444444' },
];

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

it('renders shared gradient preset chrome with active state', () => {
  const markup = renderToStaticMarkup(
    <ProductGradientPresetGrid
      presets={PRESETS}
      isActive={(preset) => preset.id === 'match'}
      onSelect={() => undefined}
    />
  );

  expect(markup).toContain('aria-pressed="true"');
  expect(markup).toContain('rounded-[12px]');
  expect(markup).toContain('hover:-translate-y-px');
  expect(markup).toContain('linear-gradient(45deg, #111111, #222222)');
});

it('selects presets after optional button props run', () => {
  const onSelect = vi.fn();
  const onClick = vi.fn();

  act(() => {
    root?.render(
      <ProductGradientPresetGrid
        presets={PRESETS}
        onSelect={onSelect}
        optionProps={(preset) => ({ onClick, disabled: preset.id === 'other' })}
      />
    );
  });

  act(() => {
    container?.querySelector<HTMLButtonElement>('button[title="Match"]')?.click();
  });

  expect(onClick).toHaveBeenCalledOnce();
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'match' }));
  expect(container?.querySelector<HTMLButtonElement>('button[title="Other"]')?.disabled).toBe(true);
});
