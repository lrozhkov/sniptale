// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../ui/compact-inspector-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ui/compact-inspector-controls')>()),
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

import { PreviewTileGrid, SegmentedSelector } from './selectors';

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

it('renders segmented selector options and routes the clicked value', () => {
  const onChange = vi.fn();

  act(() => {
    root?.render(
      <SegmentedSelector
        ariaLabel="Trajectory"
        columns={2}
        value="straight"
        onChange={onChange}
        optionClassName="wrap-option"
        options={[
          { label: 'Straight', value: 'straight' },
          { label: 'Curve', value: 'curve' },
        ]}
      />
    );
  });

  act(() => {
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'Curve')
      ?.click();
  });

  expect(container?.querySelector('[role="group"]')?.className).toContain('grid-cols-2');
  expect(container?.querySelector('button[aria-pressed="true"]')?.className).toContain(
    'wrap-option'
  );
  expect(container?.querySelector('button[aria-pressed="true"]')?.textContent).toBe('Straight');
  expect(onChange).toHaveBeenCalledWith('curve');
});

it('supports a four-column segmented selector layout', () => {
  act(() => {
    root?.render(
      <SegmentedSelector
        ariaLabel="Fill mode"
        columns={4}
        value="none"
        onChange={vi.fn()}
        options={[
          { label: 'None', value: 'none' },
          { label: 'Color', value: 'color' },
          { label: 'Gradient', value: 'gradient' },
          { label: 'Rough', value: 'rough' },
        ]}
      />
    );
  });

  expect(container?.querySelector('[role="group"]')?.className).toContain('grid-cols-4');
  expect(container?.querySelectorAll('button')).toHaveLength(4);
  expect(container?.querySelector('button span')?.className).toContain('whitespace-nowrap');
  expect(container?.querySelector('button span')?.className).not.toContain('break-word');
});

it('supports a one-column segmented selector layout for long localized labels', () => {
  act(() => {
    root?.render(
      <SegmentedSelector
        ariaLabel="Selection mode"
        columns={1}
        value="marquee"
        onChange={vi.fn()}
        options={[
          { label: 'Marquee', value: 'marquee' },
          { label: 'Magic wand', value: 'wand' },
        ]}
      />
    );
  });

  expect(container?.querySelector('[role="group"]')?.className).toContain('grid-cols-1');
  expect(container?.querySelectorAll('button')).toHaveLength(2);
});

it('renders preview tiles with accessible labels and no visible text', () => {
  const onChange = vi.fn();

  act(() => {
    root?.render(
      <PreviewTileGrid
        ariaLabel="Arrow head"
        columns={5}
        value="diamond"
        onChange={onChange}
        options={[
          { label: 'Triangle', value: 'triangle' },
          { label: 'Diamond', value: 'diamond' },
          { label: 'Open', value: 'open' },
        ]}
        renderPreview={(option) => <svg data-preview={option.value} />}
      />
    );
  });

  act(() => {
    container?.querySelector<HTMLButtonElement>('button[aria-label="Open"]')?.click();
  });

  expect(container?.querySelector('[role="group"]')?.className).toContain('grid-cols-5');
  expect(container?.querySelectorAll('button')).toHaveLength(3);
  expect(
    container?.querySelector('button[aria-label="Diamond"]')?.getAttribute('aria-pressed')
  ).toBe('true');
  expect(container?.querySelector('button[aria-label="Open"]')?.textContent).toBe('');
  expect(container?.querySelector('[data-preview="triangle"]')).not.toBeNull();
  expect(onChange).toHaveBeenCalledWith('open');
});

it('can render preview tile labels when icon-only choices are ambiguous', () => {
  act(() => {
    root?.render(
      <PreviewTileGrid
        ariaLabel="Arrow head"
        columns={2}
        showLabel
        value="triangle"
        onChange={vi.fn()}
        options={[
          { label: 'Triangle', value: 'triangle' },
          { label: 'Diamond outline', value: 'diamond-outline' },
        ]}
        renderPreview={(option) => <svg data-preview={option.value} />}
      />
    );
  });

  expect(container?.querySelector('[role="group"]')?.className).toContain('grid-cols-2');
  expect(container?.textContent).toContain('Diamond outline');
  expect(container?.querySelector('button')?.className).toContain('flex-col');
});
