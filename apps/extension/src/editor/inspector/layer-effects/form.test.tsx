// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const mockUi = vi.hoisted(() => ({
  nextNumericValue(props: Record<string, unknown>) {
    if (props['min'] === 0.2 && props['max'] === 2) return 1.25;
    if (props['value'] === 0.25) return 0.75;
    if (props['value'] === 0.1) return 0.3;
    return 0.5;
  },
  nextRangeValue(props: Record<string, unknown>) {
    return String(mockUi.nextNumericValue(props));
  },
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  ColorField: (props: Record<string, unknown>) => (
    <button
      type="button"
      data-kind="color"
      onClick={() => (props['onChange'] as ((value: string) => void) | undefined)?.('#336699')}
    >
      {String(props['label'])}
    </button>
  ),
  CompactRange: (props: Record<string, unknown>) => (
    <button
      type="button"
      data-kind="range"
      onClick={() =>
        (
          props['onChange'] as ((event: { currentTarget: { value: string } }) => void) | undefined
        )?.({
          currentTarget: { value: mockUi.nextRangeValue(props) },
        })
      }
    >
      range
    </button>
  ),
  NumericRow: (props: Record<string, unknown>) => (
    <button
      type="button"
      data-kind="range"
      onClick={() =>
        (props['onCommitValue'] as ((value: number) => void) | undefined)?.(
          mockUi.nextNumericValue(props)
        )
      }
    >
      {String(props['label'])}
    </button>
  ),
}));

import { EditorRasterEffectForm } from './form';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderForm(
  draftEffect: React.ComponentProps<typeof EditorRasterEffectForm>['draftEffect'],
  onChange = vi.fn()
) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<EditorRasterEffectForm draftEffect={draftEffect} onChange={onChange} />));
  return onChange;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('renders amount-based adjustments and forwards range changes', () => {
  const onChange = renderForm({ amount: 0.2, enabled: true, id: 'brightness' });
  const slider = container?.querySelector('[data-kind="range"]') as HTMLButtonElement | null;

  expect(container?.textContent).toContain('editor.toolbar.layerEffectsAmount');
  expect(slider).toBeTruthy();

  act(() => slider?.click());

  expect(onChange).toHaveBeenCalledWith({ amount: 0.5, enabled: true, id: 'brightness' });
});

it('renders gamma and colorize controls with their dedicated fields', () => {
  const gammaChange = renderForm({ blue: 1, enabled: true, green: 1, id: 'gamma', red: 1 });
  const gammaInputs = Array.from(container?.querySelectorAll('[data-kind="range"]') ?? []);

  expect(gammaInputs).toHaveLength(3);
  act(() => (gammaInputs[0] as HTMLButtonElement).click());
  expect(gammaChange).toHaveBeenCalledWith({
    blue: 1,
    enabled: true,
    green: 1,
    id: 'gamma',
    red: 1.25,
  });

  const colorizeChange = renderForm({
    alpha: 0.25,
    color: '#ff7a1a',
    enabled: true,
    id: 'colorize',
  });
  const colorInput = container?.querySelector('[data-kind="color"]') as HTMLButtonElement | null;
  const colorizeRange = container?.querySelector('[data-kind="range"]') as HTMLButtonElement | null;

  expect(colorInput).toBeTruthy();
  expect(colorizeRange).toBeTruthy();

  act(() => colorInput?.click());
  expect(colorizeChange).toHaveBeenCalledWith({
    alpha: 0.25,
    color: '#336699',
    enabled: true,
    id: 'colorize',
  });

  act(() => colorizeRange?.click());
  expect(colorizeChange).toHaveBeenCalledWith({
    alpha: 0.75,
    color: '#ff7a1a',
    enabled: true,
    id: 'colorize',
  });
});

it('renders filter-specific controls and ready-only messages', () => {
  const blurChange = renderForm({ blur: 0.1, enabled: true, id: 'blur' });
  act(() => (container?.querySelector('[data-kind="range"]') as HTMLButtonElement)?.click());
  expect(blurChange).toHaveBeenCalledWith({ blur: 0.3, enabled: true, id: 'blur' });

  renderForm({ enabled: true, id: 'sepia' });
  expect(container?.textContent).toContain('editor.toolbar.layerEffectsReadyToApply');
});

it('renders hue, noise, and pixelate controls through their dedicated form branches', () => {
  const hueChange = renderForm({ enabled: true, id: 'hue', rotation: 0.1 });
  act(() => (container?.querySelector('[data-kind="range"]') as HTMLButtonElement)?.click());
  expect(hueChange).toHaveBeenCalledWith({ enabled: true, id: 'hue', rotation: 0.3 });

  const noiseChange = renderForm({ enabled: true, id: 'noise', noise: 30 });
  act(() => (container?.querySelector('[data-kind="range"]') as HTMLButtonElement)?.click());
  expect(noiseChange).toHaveBeenCalledWith({ enabled: true, id: 'noise', noise: 0.5 });

  const pixelateChange = renderForm({ blocksize: 5, enabled: true, id: 'pixelate' });
  act(() => (container?.querySelector('[data-kind="range"]') as HTMLButtonElement)?.click());
  expect(pixelateChange).toHaveBeenCalledWith({ blocksize: 0.5, enabled: true, id: 'pixelate' });
});
