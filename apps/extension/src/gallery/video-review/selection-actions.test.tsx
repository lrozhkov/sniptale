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
