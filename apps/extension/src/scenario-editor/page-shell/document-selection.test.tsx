// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { guideDocumentSelection, useGuideSelectionInput } from './document-selection';

it('selects content first, preserves commands and climbs one level per Escape', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let selectedId: string | null = null;
  let selectedBlockId: string | null = null;
  const clear = vi.fn(() => {
    selectedId = null;
    selectedBlockId = null;
    draw();
  });
  const select = vi.fn((item: string, block: string | null) => {
    selectedId = item;
    selectedBlockId = block;
    draw();
  });
  function draw() {
    root.render(
      <div
        tabIndex={-1}
        {...guideDocumentSelection({
          selectedId,
          selectedBlockId,
          select,
          clear,
        })}
      >
        <article id="step" tabIndex={0}>
          <div data-block-id="text" tabIndex={0}>
            <span className="guide-voice-field">
              <textarea defaultValue="Hello world" />
            </span>
            <button>Action</button>
          </div>
          <div data-block-id="image" tabIndex={0}>
            <figure>
              <svg aria-hidden="true">
                <path d="M0 0h10" />
              </svg>
              Image
            </figure>
          </div>
        </article>
      </div>
    );
  }
  const key = async (element: Element, key: string) =>
    act(async () => {
      element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    });
  try {
    await act(async () => draw());
    const text = host.querySelector<HTMLElement>('[data-block-id="text"]')!;
    const field = host.querySelector('textarea')!;
    const mouse = () => new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true });
    let first = mouse();
    await act(async () => field.dispatchEvent(first));
    expect(first.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(text);
    expect(selectedBlockId).toBe('text');
    first = mouse();
    await act(async () => field.dispatchEvent(first));
    expect(first.defaultPrevented).toBe(false);
    await key(text, 'Enter');
    expect(document.activeElement).toBe(field);
    await key(field, 'Escape');
    expect(document.activeElement).toBe(text);
    expect(selectedBlockId).toBe('text');
    await key(text, 'Escape');
    expect(selectedBlockId).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('article'));
    await key(host.querySelector('article')!, 'Escape');
    expect(clear).toHaveBeenCalledOnce();
    expect(selectedId).toBeNull();
    const command = mouse();
    await act(async () => host.querySelector('button')!.dispatchEvent(command));
    expect(command.defaultPrevented).toBe(false);
    expect(selectedId).toBeNull();
    await act(async () => host.querySelector('svg path')!.dispatchEvent(mouse()));
    expect(selectedBlockId).toBe('image');
    expect(document.activeElement).toBe(host.querySelector('[data-block-id="image"]'));
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('distinguishes pointer selection from keyboard focus and removes modality listeners', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Surface() {
    const ref = useRef<HTMLDivElement>(null);
    useGuideSelectionInput(ref);
    return <div ref={ref} />;
  }
  await act(async () => root.render(<Surface />));
  const surface = host.firstElementChild!;
  expect(surface.getAttribute('data-selection-input')).toBe('pointer');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
  expect(surface.getAttribute('data-selection-input')).toBe('keyboard');
  document.dispatchEvent(new Event('pointerdown'));
  expect(surface.getAttribute('data-selection-input')).toBe('pointer');
  act(() => root.unmount());
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
  expect(surface.getAttribute('data-selection-input')).toBe('pointer');
  host.remove();
  vi.unstubAllGlobals();
});
