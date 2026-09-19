// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewInspector } from './inspector';
vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('hover highlights without seeking; comment selection and edit are distinct explicit actions', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  const host = document.createElement('div');
  const root = createRoot(host);
  const onSelect = vi.fn();
  const onEdit = vi.fn();
  const onHover = vi.fn();
  const annotation = { id: 'a', text: 'Comment', anchor: { kind: 'point' as const, time: 2 } };
  try {
    act(() =>
      root.render(
        <ReviewInspector
          filename="clip.webm"
          annotations={[annotation]}
          selectedId={null}
          busy={false}
          canUndo={true}
          canRedo={false}
          message={null}
          onBack={vi.fn()}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          onAdd={vi.fn()}
          onSelect={onSelect}
          onEdit={onEdit}
          onHover={onHover}
          onDelete={vi.fn()}
          onShowOnVideo={vi.fn()}
          onReport={vi.fn()}
        >
          {null}
        </ReviewInspector>
      )
    );
    act(() =>
      host.querySelector('li')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    );
    expect(onHover).toHaveBeenCalledWith(annotation);
    expect(onSelect).not.toHaveBeenCalled();
    act(() => host.querySelector<HTMLButtonElement>('li button')!.click());
    expect(onSelect).toHaveBeenCalledWith(annotation);
    expect(onEdit).not.toHaveBeenCalled();
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.editComment"]')!
        .click()
    );
    expect(onEdit).toHaveBeenCalledWith(annotation);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
