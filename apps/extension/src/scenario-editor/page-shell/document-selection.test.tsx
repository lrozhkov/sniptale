// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { guideDocumentSelection, useGuideSelectionInput } from './document-selection';

it('selects content first, finishes Enter in place and returns Escape to step settings', async () => {
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
          onTextEditing: vi.fn(),
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
    for (const extra of [{ shiftKey: true }, { isComposing: true }]) {
      const newline = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
        ...extra,
      });
      await act(async () => field.dispatchEvent(newline));
      expect(newline.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(field);
    }
    await key(field, 'Enter');
    expect(document.activeElement).toBe(text);
    await key(text, 'Enter');
    expect(document.activeElement).toBe(field);
    await key(field, 'Escape');
    const step = host.querySelector('article')!;
    expect(document.activeElement).toBe(step);
    expect(selectedBlockId).toBeNull();
    expect(field.value).toBe('Hello world');
    expect(host.firstElementChild?.getAttribute('data-selection-input')).toBe('pointer');
    await key(step, 'Escape');
    expect(selectedId).toBe('step');
    expect(selectedBlockId).toBeNull();
    expect(document.activeElement).toBe(step);
    expect(clear).not.toHaveBeenCalled();
    const command = mouse();
    await act(async () => host.querySelector('button')!.dispatchEvent(command));
    expect(command.defaultPrevented).toBe(false);
    expect(selectedId).toBe('step');
    await act(async () => host.querySelector('svg path')!.dispatchEvent(mouse()));
    expect(selectedBlockId).toBe('image');
    const image = host.querySelector<HTMLElement>('[data-block-id="image"]')!;
    expect(document.activeElement).toBe(image);
    const handled = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    handled.preventDefault();
    await act(async () => image.dispatchEvent(handled));
    expect(selectedBlockId).toBe('image');
    await key(image, 'Escape');
    expect(selectedId).toBe('step');
    expect(selectedBlockId).toBeNull();
    expect(document.activeElement).toBe(step);
    expect(clear).not.toHaveBeenCalled();
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
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(surface.getAttribute('data-selection-input')).toBe('pointer');
  act(() => root.unmount());
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
  expect(surface.getAttribute('data-selection-input')).toBe('pointer');
  host.remove();
  vi.unstubAllGlobals();
});

it('tracks textarea focus within the document and clears editing on commands or exit', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const outside = document.createElement('textarea');
  document.body.append(host, outside);
  const root = createRoot(host);
  const calls: unknown[][] = [];
  const select = vi.fn((item: string, block: string | null) => calls.push(['select', item, block]));
  const onTextEditing = vi.fn((editing: boolean) => calls.push(['editing', editing]));
  try {
    await act(async () =>
      root.render(
        <div
          {...guideDocumentSelection({
            selectedId: null,
            selectedBlockId: null,
            select,
            clear: vi.fn(),
            onTextEditing,
          })}
        >
          <article id="step">
            <div data-block-id="text">
              <textarea aria-label="First" />
              <textarea aria-label="Second" />
              <button className="guide-action-menu">Command</button>
            </div>
          </article>
        </div>
      )
    );
    const first = host.querySelector<HTMLTextAreaElement>('[aria-label="First"]')!;
    const second = host.querySelector<HTMLTextAreaElement>('[aria-label="Second"]')!;
    await act(async () => first.focus());
    expect(calls).toEqual([
      ['select', 'step', 'text'],
      ['editing', true],
    ]);
    calls.length = 0;
    await act(async () => second.focus());
    expect(calls).toEqual([
      ['editing', true],
      ['select', 'step', 'text'],
      ['editing', true],
    ]);
    calls.length = 0;
    await act(async () => host.querySelector('button')!.focus());
    expect(calls).toEqual([
      ['editing', false],
      ['editing', false],
    ]);
    await act(async () => first.focus());
    calls.length = 0;
    await act(async () => outside.focus());
    expect(calls).toEqual([['editing', false]]);
    await act(async () => first.focus());
    calls.length = 0;
    await act(async () => first.blur());
    expect(calls).toEqual([['editing', false]]);
  } finally {
    act(() => root.unmount());
    host.remove();
    outside.remove();
    vi.unstubAllGlobals();
  }
});
