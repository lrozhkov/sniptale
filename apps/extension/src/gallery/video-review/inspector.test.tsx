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
  const onDelete = vi.fn();
  const annotation = { id: 'a', text: 'Comment', anchor: { kind: 'point' as const, time: 2 } };
  try {
    act(() =>
      root.render(
        <ReviewInspector
          filename="clip.webm"
          annotations={[annotation]}
          selectedId={null}
          busy={false}

          message={null}
          onBack={vi.fn()}

          onAdd={vi.fn()}
          onSelect={onSelect}
          onEdit={onEdit}
          onHover={onHover}
          onDelete={onDelete}
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
    expect(host.querySelector('[aria-label="gallery.videoReview.showOnVideo"]')).toBeNull();
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.editComment"]')!
        .click()
    );
    expect(onEdit).toHaveBeenCalledWith(annotation);
    expect(host.querySelector('[aria-label="gallery.videoReview.deleteSelected"]')).toBeNull();
    act(() =>
      root.render(
        <ReviewInspector
          filename="clip.webm"
          annotations={[annotation]}
          selectedId={annotation.id}
          busy={false}
          message={null}
          onBack={vi.fn()}
          onAdd={vi.fn()}
          onSelect={onSelect}
          onEdit={onEdit}
          onHover={onHover}
          onDelete={onDelete}
          onReport={vi.fn()}
        >
          {null}
        </ReviewInspector>
      )
    );
    const remove = host.querySelector<HTMLButtonElement>(
      '[aria-label="gallery.videoReview.deleteSelected"]'
    )!;
    expect(remove.textContent).toContain('gallery.videoReview.deleteSelected');
    expect(remove.className).toContain('!w-full');
    expect(remove.parentElement?.className).toContain('border-t');
    act(() => remove.click());
    expect(onDelete).toHaveBeenCalledWith(annotation);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('keeps scene navigation independent of selection and resets Basic to notes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const render = (advanced: boolean, contextKey: string, selectionLabel?: string) =>
    root.render(
      <ReviewInspector
        filename="clip.webm"
        annotations={[]}
        selectedId={null}
        busy={false}

        message={null}
        onBack={vi.fn()}

        onAdd={vi.fn()}
        onSelect={vi.fn()}
        onHover={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onReport={vi.fn()}
        settingsAvailable={advanced}
        selectionHasSections={advanced && contextKey.startsWith('settings:zoom:')}
        contextKey={contextKey}
        {...(selectionLabel ? { selectionLabel } : {})}
        scene={<p>Scene controls</p>}
        saveStatus="saved"
      >
        <p>Selected controls</p>
      </ReviewInspector>
    );
  try {
    await act(async () => render(false, 'comments'));
    expect(host.querySelector('[aria-label="gallery.videoReview.inspector"]')).toBeNull();
    expect(host.textContent).not.toContain('gallery.videoReview.committed');
    expect(host.querySelector('[data-ui="gallery.videoReview.reportActions"]')).not.toBeNull();
    await act(async () => render(false, 'edit:cut-1', 'Cut'));
    expect(host.querySelector('[data-ui="gallery.videoReview.inspectorPresentation"]')).toBeNull();
    expect(host.textContent).toContain('Selected controls');
    expect(host.textContent).not.toContain('gallery.videoReview.commentsEmpty');
    expect(host.querySelector('[data-ui="gallery.videoReview.reportActions"]')).toBeNull();
    const basicTabs = () =>
      Array.from(
        host.querySelectorAll<HTMLButtonElement>(
          '[aria-label="gallery.videoReview.inspector"] button'
        )
      );
    expect(basicTabs().map((button) => button.textContent)).toEqual([
      'gallery.videoReview.comments',
      'Cut',
    ]);
    await act(async () => basicTabs()[0]!.click());
    expect(host.textContent).not.toContain('Selected controls');
    expect(host.querySelector('[data-ui="gallery.videoReview.reportActions"]')).not.toBeNull();
    await act(async () => basicTabs()[1]!.click());
    expect(host.textContent).toContain('Selected controls');
    await act(async () => render(false, 'comments'));
    expect(host.querySelector('[aria-label="gallery.videoReview.inspector"]')).toBeNull();
    await act(async () => render(true, 'settings:none:'));
    expect(host.querySelector('[data-ui="gallery.videoReview.exportFooter"]')).toBeNull();
    expect(host.textContent).toContain('Scene controls');
    expect(host.querySelector('[data-ui="gallery.videoReview.reportActions"]')).toBeNull();
    await act(async () => render(true, 'settings:zoom:z1', 'Zoom'));
    expect(
      host.querySelector('[data-ui="gallery.videoReview.inspectorPresentation"]')
    ).not.toBeNull();
    expect(host.textContent).toContain('Selected controls');
    expect(host.querySelector('[data-ui="gallery.videoReview.reportActions"]')).toBeNull();
    const tabs = () =>
      Array.from(
        host.querySelectorAll<HTMLButtonElement>(
          '[aria-label="gallery.videoReview.inspector"] button'
        )
      );
    await act(async () =>
      tabs()
        .find((button) => button.textContent === 'gallery.videoReview.scene')!
        .click()
    );
    expect(host.textContent).toContain('Scene controls');
    expect(host.querySelector('[data-ui="gallery.videoReview.reportActions"]')).toBeNull();
    expect(tabs().some((button) => button.textContent === 'Zoom')).toBe(true);
    await act(async () =>
      tabs()
        .find((button) => button.textContent === 'Zoom')!
        .click()
    );
    expect(host.textContent).toContain('Selected controls');
    expect(host.querySelector('[data-ui="gallery.videoReview.reportActions"]')).toBeNull();
    await act(async () => render(false, 'comments'));
    expect(host.textContent).not.toContain('Selected controls');
    expect(host.textContent).not.toContain('Scene controls');
    expect(host.querySelector('[aria-label="gallery.videoReview.inspector"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('consumes export requests once and returns to the same selected edit', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  let selection = { kind: 'edit' as const, id: 'cut-1' };
  const render = (request: number, busy = false) =>
    root.render(
      <ReviewInspector
        filename="clip.webm"
        annotations={[]}
        selectedId={null}
        busy={busy}
        message={null}
        onBack={vi.fn()}
        onAdd={vi.fn()}
        onSelect={vi.fn()}
        onHover={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onReport={vi.fn()}
        contextKey="edit:cut-1"
        contextSelection={selection}
        selectionLabel="Cut"
        settingsAvailable
        exportRequest={request}
        actions={
          <label>
            Quality
            <input defaultValue="high" />
          </label>
        }
        scene={<p>Scene controls</p>}
      >
        <p>Cut controls</p>
      </ReviewInspector>
    );
  try {
    await act(async () => render(0));
    expect(host.textContent).toContain('Cut controls');
    await act(async () => render(1));
    const exporting = () => host.querySelector('[data-ui="gallery.videoReview.exportSection"]');
    expect(exporting()).not.toBeNull();
    expect(host.querySelector('[data-ui="gallery.videoReview.exportFooter"]')).toBeNull();
    expect(host.querySelector('.review-inspector-scroll')?.contains(exporting())).toBe(true);
    await act(async () => render(1, true));
    expect(exporting()).not.toBeNull();
    selection = { kind: 'edit', id: 'cut-1' };
    await act(async () => render(1));
    expect(exporting()).toBeNull();
    expect(host.textContent).toContain('Cut controls');
    await act(async () => render(2));
    expect(exporting()).not.toBeNull();
    const scene = host.querySelector<HTMLButtonElement>(
      '[aria-label="gallery.videoReview.inspector"] button[title="gallery.videoReview.scene"]'
    )!;
    await act(async () => scene.click());
    expect(host.textContent).toContain('Scene controls');
    await act(async () => render(2, true));
    expect(exporting()).toBeNull();
    const tab = Array.from(
      host.querySelectorAll<HTMLButtonElement>(
        '[aria-label="gallery.videoReview.inspector"] button'
      )
    ).find((button) => button.textContent === 'gallery.videoReview.exportSettings')!;
    expect(tab.disabled).toBe(false);
    await act(async () => tab.click());
    expect(exporting()).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
