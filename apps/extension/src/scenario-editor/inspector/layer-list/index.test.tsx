// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductLayerList } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('ProductLayerList', () => {
  it('renders editor-like rows and routes select and action callbacks', () => {
    const onSelectItem = vi.fn();
    const onToggle = vi.fn();

    act(() => {
      root?.render(
        <ProductLayerList
          emptyLabel="No layers"
          items={[
            {
              actions: [{ icon: 'V', label: 'Toggle visibility', onClick: onToggle }],
              id: 'layer-1',
              meta: 'Text',
              selected: true,
              title: 'Title layer',
            },
          ]}
          onSelectItem={onSelectItem}
        />
      );
    });
    act(() => {
      container?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.click();
      container?.querySelector<HTMLButtonElement>('[aria-label="Toggle visibility"]')?.click();
    });

    expect(onSelectItem).toHaveBeenCalledWith('layer-1');
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders a compact empty state', () => {
    act(() => {
      root?.render(<ProductLayerList emptyLabel="No layers" items={[]} onSelectItem={vi.fn()} />);
    });

    expect(container?.textContent).toContain('No layers');
  });
});
