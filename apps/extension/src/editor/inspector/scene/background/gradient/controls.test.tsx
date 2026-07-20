// @vitest-environment jsdom

import React from 'react';
import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: vi.fn((key: string) => key),
}));
vi.mock('@sniptale/ui/product-modal/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal/actions')>()),
  ProductActionButton: (props: React.PropsWithChildren<{ onClick: () => void }>) => (
    <button type="button" onClick={props.onClick}>
      {props.children}
    </button>
  ),
}));
vi.mock('../../../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../chrome/ui')>()),
  NumericRow: (props: {
    className?: string;
    label: string;
    onCommitValue: (value: number) => void;
    unit?: string;
    value: number;
  }) => (
    <button
      type="button"
      data-testid="numeric-row"
      data-label={props.label}
      data-class-name={props.className}
      data-unit={props.unit ?? ''}
      data-value={String(props.value)}
      onClick={() => props.onCommitValue(90)}
    />
  ),
  ColorField: (props: {
    label: string;
    title: string;
    value: string;
    onChange: (value: string) => void;
    onPreviewChange: (value: string) => void;
    onPreviewReset: (value: string) => void;
  }) => (
    <div data-testid="color-control" data-label={props.label} data-value={props.value}>
      <button type="button" onClick={() => props.onChange('#def')}>
        {props.title}-apply
      </button>
      <button type="button" onClick={() => props.onPreviewChange('#abc')}>
        {props.title}-preview
      </button>
      <button type="button" onClick={() => props.onPreviewReset('#fed')}>
        {props.title}-reset
      </button>
    </div>
  ),
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

import { GradientAngleControls, GradientColorControls, GradientPresetGrid } from './controls';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

function clickGradientButton(label: string) {
  (
    Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
      button.textContent?.includes(label)
    ) as HTMLButtonElement | undefined
  )?.click();
}

function clickGradientAction(ariaLabel: string) {
  (container?.querySelector(`[aria-label="${ariaLabel}"]`) as HTMLButtonElement | null)?.click();
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
  vi.unstubAllGlobals();
});

it('renders gradient presets and applies the clicked preset', () => {
  const applyGradientPreset = vi.fn();

  render(
    <GradientPresetGrid
      applyGradientPreset={applyGradientPreset}
      frameDraft={
        {
          backgroundGradientAngle: 45,
          backgroundGradientFrom: '#111',
          backgroundGradientTo: '#222',
        } as never
      }
      gradientPresets={[
        { angle: 45, from: '#111', id: 'match', label: 'Match', to: '#222' },
        { angle: 90, from: '#333', id: 'other', label: 'Other', to: '#444' },
        { angle: 45, from: '#111', id: 'to-mismatch', label: 'To mismatch', to: '#999' },
        { angle: 90, from: '#111', id: 'angle-mismatch', label: 'Angle mismatch', to: '#222' },
      ]}
    />
  );

  act(() => {
    (container?.querySelector('button') as HTMLButtonElement | null)?.click();
  });

  expect(container?.textContent).toContain('Match');
  const buttons = container?.querySelectorAll<HTMLButtonElement>('button') ?? [];
  expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
  expect(buttons[1]?.getAttribute('aria-pressed')).toBe('false');
  expect(buttons[2]?.getAttribute('aria-pressed')).toBe('false');
  expect(buttons[3]?.getAttribute('aria-pressed')).toBe('false');
  expect(applyGradientPreset).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'match', label: 'Match' })
  );
});

it('wires gradient color applies into frame patches', () => {
  const applyFramePatch = vi.fn();

  render(
    <GradientColorControls
      applyFramePatch={applyFramePatch}
      frameBackgroundPalette={['#111111']}
      frameDraft={
        {
          backgroundGradientAngle: 45,
          backgroundGradientFrom: '#111',
          backgroundGradientTo: '#222',
        } as never
      }
      previewFramePatch={vi.fn()}
      recentColors={['#333333']}
    />
  );

  const colorInputs = container?.querySelectorAll('[data-testid="color-control"]') ?? [];
  expect(colorInputs).toHaveLength(1);
  expect(colorInputs[0]?.getAttribute('data-label')).toBe('editor.gradient.color');
  expect(colorInputs[0]?.getAttribute('data-value')).toBe('#111');

  const buttons = Array.from(container?.querySelectorAll('button') ?? []).filter((button) =>
    button.textContent?.includes('editor.gradient.color-apply')
  );
  act(() => {
    (buttons[0] as HTMLButtonElement | undefined)?.click();
  });

  expect(applyFramePatch).toHaveBeenCalledWith(
    expect.objectContaining({
      backgroundGradientFrom: '#def',
      backgroundGradientStops: ['#def', '#222'],
      backgroundGradientTo: '#222',
    })
  );
});

it('adds extra gradient colors through the stop list', () => {
  const applyFramePatch = vi.fn();

  render(
    <GradientColorControls
      applyFramePatch={applyFramePatch}
      frameBackgroundPalette={['#111111']}
      frameDraft={
        {
          backgroundGradientAngle: 45,
          backgroundGradientFrom: '#111',
          backgroundGradientTo: '#222',
        } as never
      }
      previewFramePatch={vi.fn()}
      recentColors={['#333333']}
    />
  );

  act(() => {
    (
      container?.querySelector('[aria-label="editor.gradient.addStop"]') as HTMLButtonElement | null
    )?.click();
  });

  expect(applyFramePatch).toHaveBeenCalledWith(
    expect.objectContaining({
      backgroundGradientFrom: '#111',
      backgroundGradientStops: ['#111', '#111', '#222'],
      backgroundGradientTo: '#222',
    })
  );
});

it('moves, previews, and removes gradient stops', () => {
  const applyFramePatch = vi.fn();
  const previewFramePatch = vi.fn();

  render(
    <GradientColorControls
      applyFramePatch={applyFramePatch}
      frameBackgroundPalette={['#111111']}
      frameDraft={
        {
          backgroundGradientAngle: 45,
          backgroundGradientFrom: '#111',
          backgroundGradientTo: '#333',
          backgroundGradientStops: ['#111', '#222', '#333'],
        } as never
      }
      previewFramePatch={previewFramePatch}
      recentColors={['#333333']}
    />
  );

  act(() => {
    clickGradientAction('editor.gradient.reverseStops');
    clickGradientAction('editor.gradient.removeStop');
    clickGradientButton('editor.gradient.color-preview');
    clickGradientButton('editor.gradient.color-reset');
  });

  expect(applyFramePatch).toHaveBeenCalledWith(
    expect.objectContaining({ backgroundGradientStops: ['#333', '#222', '#111'] })
  );
  expect(applyFramePatch).toHaveBeenCalledWith(
    expect.objectContaining({ backgroundGradientStops: ['#222', '#333'] })
  );
  expect(previewFramePatch).toHaveBeenCalledWith(
    expect.objectContaining({ backgroundGradientStops: ['#abc', '#222', '#333'] })
  );
  expect(previewFramePatch).toHaveBeenCalledWith(
    expect.objectContaining({ backgroundGradientStops: ['#fed', '#222', '#333'] })
  );
});

it('renders gradient angle as a numeric row with a visible label and value', () => {
  const applyFramePatch = vi.fn();

  render(
    <GradientAngleControls
      applyFramePatch={applyFramePatch}
      frameDraft={{ backgroundGradientAngle: 45 } as never}
      toNumber={(value, fallback = 0) => Number(value) || fallback}
    />
  );

  expect(container?.querySelector('[data-testid="numeric-row"]')?.getAttribute('data-label')).toBe(
    'editor.scene.gradientAngleLabel'
  );
  expect(container?.querySelector('[data-testid="numeric-row"]')?.getAttribute('data-value')).toBe(
    '45'
  );
  expect(container?.querySelector('[data-testid="numeric-row"]')?.getAttribute('data-unit')).toBe(
    'deg'
  );
  expect(container?.querySelector('[data-testid="compact-input"]')).toBeNull();

  act(() => {
    (container?.querySelector('[data-testid="numeric-row"]') as HTMLButtonElement | null)?.click();
  });

  expect(applyFramePatch).toHaveBeenCalledWith({ backgroundGradientAngle: 90 });
});
