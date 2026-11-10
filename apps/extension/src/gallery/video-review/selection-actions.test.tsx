// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  ReviewSelectionActionsContext,
  ReviewFloatingSelectionActions,
  useReviewSelectionActions,
} from './selection-actions';
import { ReviewInspectorSections, reviewInspectorActions } from './inspector-sections';
import { ReviewButton } from './controls';
it('keeps existing inspector commands and anchors one guarded floating command host inside its modal', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const command = vi.fn();
  let disabled = false;
  const rectangle = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      if (this.tagName === 'DIALOG') return new DOMRect(0, 0, 1000, 800);
      if (this.dataset['ui'] === 'gallery.videoReview.selectionActions')
        return new DOMRect(0, 0, 42, 42);
      return new DOMRect(200, 400, 100, 32);
    });
  function Fixture() {
    const [selected, select] = useState(false);
    const actions = useReviewSelectionActions(
      selected ? { kind: 'edit', id: 'one' } : { kind: 'none' },
      true,
      disabled
    );
    return (
      <dialog open>
        <ReviewSelectionActionsContext value={actions.target}>
          {actions.target ? (
            <ReviewFloatingSelectionActions target={actions.target} onHost={actions.setHost} />
          ) : null}
          <div data-ui="gallery.videoReview.timeline" onPointerDownCapture={actions.capture}>
            <button data-review-removal-key="edit:one" onClick={() => select(true)}>
              Edit
            </button>
          </div>
          <ReviewInspectorSections
            sections={[
              reviewInspectorActions(
                <ReviewButton label="Remove" onClick={command}>
                  <span>Remove text</span>
                </ReviewButton>
              ),
            ]}
          />
        </ReviewSelectionActionsContext>
      </dialog>
    );
  }
  try {
    await act(async () => root.render(<Fixture />));
    const item = host.querySelector<HTMLButtonElement>('[data-review-removal-key]')!;
    await act(async () => {
      item.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 250 }));
      item.click();
    });
    const panel = host.querySelector<HTMLFieldSetElement>(
      '[data-ui="gallery.videoReview.selectionActions"]'
    )!;
    expect(panel.parentElement?.tagName).toBe('DIALOG');
    expect(panel.style.visibility).toBe('visible');
    expect(panel.style.left).toBe('229px');
    expect(panel.style.top).toBe('348px');
    expect(panel.dataset['tailSide']).toBe('bottom');
    expect(panel.style.getPropertyValue('--review-actions-tail-x')).toBe('21px');
    expect(host.querySelector('[data-section="actions"] button')).not.toBeNull();
    expect(panel.querySelectorAll('button')).toHaveLength(1);
    await act(async () => panel.querySelector<HTMLButtonElement>('button')!.click());
    expect(command).toHaveBeenCalledOnce();
    disabled = true;
    await act(async () => root.render(<Fixture />));
    expect(panel.disabled).toBe(true);
    await act(async () => panel.querySelector<HTMLButtonElement>('button')!.click());
    expect(command).toHaveBeenCalledOnce();
    disabled = false;
    await act(async () => root.render(<Fixture />));
    panel.querySelector<HTMLButtonElement>('button')!.focus();
    await act(async () =>
      panel.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      )
    );
    expect(host.querySelector('[data-ui="gallery.videoReview.selectionActions"]')).toBeNull();
    expect(document.activeElement).toBe(item);
    expect(host.querySelector('[data-section="actions"] button')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    rectangle.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('anchors every supported selection identity and preserves ordered Ctrl and Shift selection', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  type Selection = import('../../features/video/review/types').ReviewSelection;
  let selected: Selection = { kind: 'none' };
  let disabled = false;
  let actions!: ReturnType<typeof useReviewSelectionActions>;
  const command = vi.fn();
  const choices: { selection: Selection; key: string }[] = [
    { selection: { kind: 'edit', id: 'a' }, key: 'edit:a' },
    { selection: { kind: 'edit', id: 'b' }, key: 'edit:b' },
    { selection: { kind: 'zoom', id: 'zoom' }, key: 'focus:zoom' },
    { selection: { kind: 'annotation-effect', id: 'annotation' }, key: 'annotation:annotation' },
    { selection: { kind: 'text', id: 'text' }, key: 'text:text' },
    { selection: { kind: 'audio', lane: 'music', id: 'music' }, key: 'audio:music' },
    { selection: { kind: 'original-audio', id: 'original' }, key: 'original-audio:original' },
    {
      selection: { kind: 'telemetry', ref: { kind: 'action', id: 'click' } },
      key: 'telemetry:action:click',
    },
    { selection: { kind: 'cursor-motion', id: 'cursor' }, key: 'cursor-motion:cursor' },
    { selection: { kind: 'cursor-focus', id: 'point', time: 0 }, key: 'cursor-focus:point' },
    { selection: { kind: 'zoom-link', id: 'link' }, key: 'zoom-link:link' },
    { selection: { kind: 'webcam-position', id: 'position' }, key: 'webcam-position:position' },
    { selection: { kind: 'webcam-hidden', id: 'hidden' }, key: 'webcam-hidden:hidden' },
  ];
  function Fixture() {
    actions = useReviewSelectionActions(selected, true, disabled, command);
    return (
      <dialog open>
        <div
          data-ui="gallery.videoReview.timeline"
          onPointerDownCapture={(event) => {
            actions.capture(event);
            actions.multiSelection.captureModified(event);
          }}
        >
          <div data-review-track="source">
            {choices.map(({ key }, index) => (
              <button
                key={key}
                data-review-removal-key={index === 9 ? undefined : key}
                data-cursor-focus-key={index === 9 ? 'point' : undefined}
                data-choice={key}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      </dialog>
    );
  }
  const render = () => act(() => root.render(<Fixture />));
  const pointer = (index: number, options: MouseEventInit = {}) =>
    act(() =>
      host
        .querySelectorAll('button')
        [index]!.dispatchEvent(
          new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 50, ...options })
        )
    );
  const visible = vi
    .spyOn(HTMLElement.prototype, 'getClientRects')
    .mockReturnValue({ length: 1 } as DOMRectList);
  try {
    for (const [index, choice] of choices.entries()) {
      selected = choice.selection;
      render();
      pointer(index);
      expect(actions.target?.key).toBe(choice.key);
    }
    selected = { kind: 'none' };
    render();
    pointer(0);
    expect(actions.target).toBeNull();
    selected = choices[0]!.selection;
    render();
    pointer(0);
    pointer(1, { ctrlKey: true });
    expect(actions.multiSelection.keys).toEqual(['edit:a', 'edit:b']);
    expect(host.querySelectorAll('[data-review-multi-selected]')).toHaveLength(2);
    pointer(2, { shiftKey: true });
    expect(actions.multiSelection.keys).toContain('focus:zoom');
    pointer(1, { metaKey: true });
    expect(actions.multiSelection.keys).not.toContain('edit:b');
    disabled = true;
    render();
    const before = actions.multiSelection.keys;
    pointer(3, { ctrlKey: true });
    expect(actions.multiSelection.keys).toEqual(before);
    act(() => actions.multiSelection.clear());
    expect(actions.multiSelection.keys).toEqual([]);
    act(() => actions.capture({ target: host }));
    expect(actions.target).toBeNull();
    expect(command).toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    host.remove();
    visible.mockRestore();
    vi.unstubAllGlobals();
  }
});
