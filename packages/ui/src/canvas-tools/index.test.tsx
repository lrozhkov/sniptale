// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CanvasInsertToolPanel, type CanvasToolAction } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function action(id: string, group?: CanvasToolAction['group']): CanvasToolAction {
  const base = {
    icon: <span>{id}</span>,
    id,
    label: `${id} label`,
    onSelect: vi.fn(),
  };
  return group ? { ...base, group } : base;
}

describe('shared canvas tool panels', () => {
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    container = null;
  });

  registerCanvasToolStaticTests();
  registerCanvasToolInteractionTests();
});

function registerCanvasToolStaticTests() {
  it('renders common tool descriptors as floating toolbar buttons grouped by role', () => {
    const markup = renderToStaticMarkup(
      <CanvasInsertToolPanel
        dataUi="shared.canvas.insert"
        label="Insert"
        actions={[action('text'), action('shape'), action('timeline', 'editor')]}
      />
    );

    expect(markup).toContain('data-ui="shared.canvas.insert"');
    expect(markup).toContain('data-ui="shared.canvas.insert.text"');
    expect(markup).toContain('data-ui="shared.canvas.insert.shape"');
    expect(markup).toContain('data-ui="shared.canvas.insert.timeline"');
    expect(markup).toContain('aria-label="Insert"');
  });
}

function registerCanvasToolInteractionTests() {
  registerCanvasToolActiveStateTests();
  registerCanvasToolFileInputTests();
}

function registerCanvasToolActiveStateTests() {
  it('exposes active canvas tools through a shared pressed state', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <CanvasInsertToolPanel
          dataUi="shared.canvas.insert"
          label="Insert"
          actions={[{ ...action('text'), active: true }, action('shape')]}
        />
      );
    });

    expect(
      container
        .querySelector<HTMLButtonElement>('[data-ui="shared.canvas.insert.text"]')
        ?.getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      container
        .querySelector<HTMLButtonElement>('[data-ui="shared.canvas.insert.shape"]')
        ?.hasAttribute('aria-pressed')
    ).toBe(false);
  });
}

function registerCanvasToolFileInputTests() {
  it('owns file input trigger behavior for media insert actions', () => {
    const onSelectFile = vi.fn();
    const file = new File(['image'], 'insert.png', { type: 'image/png' });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <CanvasInsertToolPanel
          dataUi="shared.canvas.insert"
          label="Insert"
          actions={[
            {
              accept: 'image/*',
              icon: <span>image</span>,
              id: 'image',
              label: 'Image',
              onSelect: vi.fn(),
              onSelectFile,
            },
          ]}
        />
      );
    });

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input?.accept).toBe('image/*');
    act(() => {
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      input?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(input?.value).toBe('');
    expect(onSelectFile).toHaveBeenCalledWith(file);
  });
}
