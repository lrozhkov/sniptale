// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewInspector as Inspector } from './inspector';
import { useReviewInspectorNavigation } from './inspector-navigation';
import type { ReviewSelection } from '../../features/video/review/types';

function ReviewInspector(
  props: Omit<Parameters<typeof Inspector>[0], 'navigation'> & {
    contextKey?: string;
    contextSelection?: ReviewSelection;
    exportRequest?: number;
  }
) {
  const navigation = useReviewInspectorNavigation({ ...props, exportAvailable: !!props.actions });
  return <Inspector {...props} navigation={navigation} />;
}

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
  const onToggleHeight = vi.fn();
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
    expect(host.querySelector('header h2')?.textContent).toBe('clip.webm');
    expect(host.querySelector('header h2')?.getAttribute('title')).toBe('clip.webm');
    expect(host.querySelectorAll('[title="clip.webm"]')).toHaveLength(1);
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
          fullHeight
          onToggleHeight={onToggleHeight}
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
    const headerActions = host.querySelectorAll<HTMLButtonElement>('header button');
    const height = headerActions[headerActions.length - 2]!;
    expect(height.getAttribute('aria-label')).toBe('videoEditor.app.panelRestoreHeight');
    expect(headerActions[headerActions.length - 1]!.getAttribute('aria-label')).toBe(
      'common.actions.close'
    );
    act(() => height.click());
    expect(onToggleHeight).toHaveBeenCalledOnce();
    const remove = host.querySelector<HTMLButtonElement>(
      '[aria-label="gallery.videoReview.deleteSelected"]'
    )!;
    expect(remove.textContent).toBe('');
    expect(remove.title).toBe('gallery.videoReview.deleteSelected');
    expect(remove.querySelector('svg')).not.toBeNull();
    expect(remove.className).toContain('!w-8');
    expect(remove.parentElement?.className).toContain('review-inspector-row-actions');
    expect(
      remove.parentElement?.querySelector('[aria-label="gallery.videoReview.editComment"]')
    ).not.toBeNull();
    act(() => remove.click());
    expect(onDelete).toHaveBeenCalledWith(annotation);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it.each([false, true])(
  'restores a removed note action locally unless focus moved elsewhere=%s',
  (focusElsewhere) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    const other = document.createElement('button');
    document.body.append(host, other);
    const root = createRoot(host);
    const note = { id: 'note', text: 'Note', anchor: { kind: 'point' as const, time: 2 } };
    const render = (visible: boolean, busy = false) =>
      root.render(
        <ReviewInspector
          filename="clip.webm"
          annotations={visible ? [note] : []}
          selectedId={visible ? note.id : null}
          busy={busy}
          message={null}
          onBack={vi.fn()}
          onAdd={vi.fn()}
          onSelect={vi.fn()}
          onHover={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onReport={vi.fn()}
        >
          {null}
        </ReviewInspector>
      );
    try {
      act(() => render(true));
      const remove = host.querySelector<HTMLButtonElement>('[data-note-delete]')!;
      remove.focus();
      if (focusElsewhere) other.focus();
      act(() => remove.click());
      act(() => render(true, true));
      // Native disabling blurs the active button before its row disappears.
      if (remove.disabled && document.activeElement === remove) {
        document.body.tabIndex = -1;
        document.body.focus();
        document.body.removeAttribute('tabindex');
      }
      act(() => render(false));
      expect(host.querySelector('[data-note-delete]')).toBeNull();
      expect(document.activeElement).toBe(
        focusElsewhere ? other : host.querySelector('.review-inspector-list')
      );
    } finally {
      act(() => root.unmount());
      host.remove();
      other.remove();
      vi.unstubAllGlobals();
    }
  }
);

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
        onBackup={vi.fn()}
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
    expect(
      host.querySelector(
        '[data-ui="gallery.videoReview.reportActions"] [aria-label="gallery.app.selectionBackup"]'
      )
    ).not.toBeNull();
    await act(async () => render(false, 'edit:cut-1', 'Cut'));
    expect(host.querySelector('[data-ui="gallery.videoReview.inspectorPresentation"]')).toBeNull();
    expect(host.textContent).toContain('Selected controls');
    expect(host.textContent).not.toContain('gallery.videoReview.commentsEmpty');
    expect(host.querySelector('[aria-label="gallery.app.selectionBackup"]')).toBeNull();
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
    expect(host.querySelector('[aria-label="gallery.app.selectionBackup"]')).toBeNull();
    expect(host.querySelector('[data-ui="gallery.videoReview.reportActions"]')).toBeNull();
    const presentation = host.querySelector<HTMLButtonElement>(
      '[data-ui="gallery.videoReview.inspectorPresentation"]'
    )!;
    const originalLabel = presentation.getAttribute('aria-label');
    await act(async () => presentation.click());
    expect(presentation.getAttribute('aria-label')).not.toBe(originalLabel);
    await act(async () => presentation.click());
    expect(presentation.getAttribute('aria-label')).toBe(originalLabel);
    expect(presentation.nextElementSibling?.getAttribute('aria-label')).toBe(
      'videoEditor.app.panelFullHeight'
    );
    await act(async () => render(true, 'settings:zoom:z1', 'Zoom'));
    expect(
      host.querySelector('[data-ui="gallery.videoReview.inspectorPresentation"]')
    ).not.toBeNull();
    expect(host.textContent).toContain('Selected controls');
    expect(host.querySelector('[aria-label="gallery.app.selectionBackup"]')).toBeNull();
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
    expect(host.querySelector('[aria-label="gallery.app.selectionBackup"]')).toBeNull();
    expect(host.querySelector('[data-ui="gallery.videoReview.reportActions"]')).toBeNull();
    expect(tabs().some((button) => button.textContent === 'Zoom')).toBe(true);
    await act(async () =>
      tabs()
        .find((button) => button.textContent === 'Zoom')!
        .click()
    );
    expect(host.textContent).toContain('Selected controls');
    expect(host.querySelector('[aria-label="gallery.app.selectionBackup"]')).toBeNull();
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
  const onBackup = vi.fn();
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
        onBackup={onBackup}
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
    expect(
      Array.from(
        host.querySelectorAll('[data-ui="gallery.videoReview.inspectorNavigation"] button')
      ).map((node) => node.textContent)
    ).toEqual(['gallery.videoReview.comments', 'gallery.videoReview.scene', 'Cut']);
    await act(async () => render(1));
    const exporting = () => host.querySelector('[data-ui="gallery.videoReview.exportSection"]');
    expect(exporting()).not.toBeNull();
    const backup = exporting()!.querySelector<HTMLButtonElement>(
      '[aria-label="gallery.app.selectionBackup"]'
    )!;
    expect(backup).not.toBeNull();
    await act(async () => backup.click());
    expect(onBackup).toHaveBeenCalledOnce();
    expect(
      Array.from(
        host.querySelectorAll('[data-ui="gallery.videoReview.inspectorNavigation"] button')
      ).map((node) => node.textContent)
    ).toEqual([
      'gallery.videoReview.comments',
      'gallery.videoReview.scene',
      'gallery.videoReview.exportSection',
    ]);
    expect(exporting()?.querySelector('h3')).toBeNull();
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
    ).find((button) => button.textContent === 'gallery.videoReview.exportSection')!;
    expect(tab.disabled).toBe(false);
    await act(async () => tab.click());
    expect(exporting()).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it.each(['scene', 'selected', 'history', 'export'] as const)(
  'returns from Preview to %s without leaving the editor or changing selection',
  (section) => {
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
    const leave = vi.fn();
    let navigation!: ReturnType<typeof useReviewInspectorNavigation>;
    function Fixture() {
      navigation = useReviewInspectorNavigation({
        settingsAvailable: true,
        selectionLabel: 'Selected object',
        contextKey: 'selected:x',
        exportAvailable: true,
      });
      return (
        <>
          <button
            id="preview-trigger"
            onClick={(event) => navigation.openPreview(event.currentTarget)}
          >
            Preview
          </button>
          <Inspector
            filename="clip"
            annotations={[]}
            selectedId={null}
            busy={false}
            message={null}
            settingsAvailable
            selectionLabel="Selected object"
            navigation={navigation}
            scene={<span>Scene</span>}
            actions={<span>Export</span>}
            actionHistory={<span>History</span>}
            preview={<button>Quality</button>}
            onBack={leave}
            onAdd={vi.fn()}
            onSelect={vi.fn()}
            onHover={vi.fn()}
            onEdit={vi.fn()}
            onDelete={vi.fn()}
            onReport={vi.fn()}
          >
            <span>Object</span>
          </Inspector>
        </>
      );
    }
    try {
      act(() => root.render(<Fixture />));
      act(() => navigation.setSection(section));
      const trigger = host.querySelector<HTMLButtonElement>('#preview-trigger')!;
      act(() => trigger.click());
      act(() => trigger.click());
      expect(navigation.shown).toBe('preview');
      expect(document.activeElement?.getAttribute('data-ui')).toBe(
        'gallery.videoReview.previewInspector'
      );
      const panel = host.querySelector<HTMLElement>(
        '[data-ui="gallery.videoReview.previewInspector"]'
      )!;
      act(() =>
        panel.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
        )
      );
      expect(navigation.shown).toBe(section);
      expect(document.activeElement).toBe(trigger);
      expect(leave).not.toHaveBeenCalled();
      act(() => trigger.click());
      const close = host.querySelector<HTMLButtonElement>(
        'header [aria-label="common.actions.close"]'
      )!;
      expect(host.querySelector('header .lucide-arrow-left')).toBeNull();
      act(() => close.click());
      expect(leave).toHaveBeenCalledOnce();
    } finally {
      act(() => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  }
);

it.each([true, false])(
  'opens original speech with advanced settings=%s and leaves it on mode change',
  (advanced) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    const root = createRoot(host);
    let navigation!: ReturnType<typeof useReviewInspectorNavigation>;
    let settingsAvailable = advanced;
    const beforeAction = vi.fn((action: () => void) => action());
    function Harness() {
      navigation = useReviewInspectorNavigation({
        beforeAction,
        contextKey: 'settings:none:',
        contextSelection: { kind: 'none' },
        settingsAvailable,
        exportAvailable: true,
      });
      return (
        <>
          <output>{navigation.shown}</output>
          <Inspector
            filename="clip.webm"
            annotations={[]}
            selectedId={null}
            busy={false}
            message={null}
            navigation={navigation}
            settingsAvailable={settingsAvailable}
            speech={<p>Speech controls</p>}
            onBack={vi.fn()}
            onAdd={vi.fn()}
            onSelect={vi.fn()}
            onHover={vi.fn()}
            onEdit={vi.fn()}
            onDelete={vi.fn()}
            onReport={vi.fn()}
          >
            {null}
          </Inspector>
        </>
      );
    }
    try {
      act(() => root.render(<Harness />));
      act(() => navigation.setSection('speech'));
      expect(host.querySelector('output')?.textContent).toBe('speech');
      expect(
        Array.from(
          host.querySelectorAll('[data-ui="gallery.videoReview.inspectorNavigation"] button')
        ).map((node) => node.textContent)
      ).toEqual([
        'gallery.videoReview.comments',
        ...(advanced ? ['gallery.videoReview.scene'] : []),
        'gallery.videoReview.speechTitle',
      ]);
      const presentation = host.querySelector<HTMLButtonElement>(
        '[data-ui="gallery.videoReview.inspectorPresentation"]'
      );
      expect(presentation).not.toBeNull();
      act(() => presentation!.click());
      expect(navigation.presentation).toBe('sections');
      expect(beforeAction).toHaveBeenCalledTimes(1);
      act(() => root.render(<Harness />));
      expect(host.querySelector('output')?.textContent).toBe('speech');
      act(() => navigation.setSection(advanced ? 'scene' : 'comments'));
      expect(host.querySelector('output')?.textContent).toBe(advanced ? 'scene' : 'comments');
      act(() => navigation.setSection('speech'));
      settingsAvailable = !advanced;
      act(() => root.render(<Harness />));
      expect(host.querySelector('output')?.textContent).toBe(advanced ? 'comments' : 'scene');
    } finally {
      act(() => root.unmount());
      vi.unstubAllGlobals();
    }
  }
);

it('opens the track document in the third context and closes it on selection or section change', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  function Harness() {
    const [selection, setSelection] = useState<ReviewSelection>({ kind: 'text', id: 'one' });
    const navigation = useReviewInspectorNavigation({
      contextKey: selection.kind === 'text' ? `text:${selection.id}` : 'none',
      contextSelection: selection,
      selectionLabel: selection.kind === 'text' ? 'Phrase' : undefined,
      settingsAvailable: true,
      exportAvailable: false,
    });
    return (
      <>
        <button
          data-open-track
          onClick={() => {
            setSelection({ kind: 'none' });
            navigation.setSection('text');
          }}
        >
          Track document
        </button>
        <button
          data-select-text
          onClick={() => {
            setSelection({ kind: 'text', id: 'one' });
            navigation.setSection('selected');
          }}
        >
          Select text block
        </button>
        <Inspector
          navigation={navigation}
          filename="clip"
          annotations={[]}
          selectedId={null}
          busy={false}
          message={null}
          settingsAvailable
          selectionLabel={selection.kind === 'text' ? 'Phrase' : undefined}
          textDocument={<p data-track-document>Document list</p>}
          scene={<p>Scene controls</p>}
          onBack={vi.fn()}
          onAdd={vi.fn()}
          onSelect={vi.fn()}
          onHover={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onReport={vi.fn()}
        >
          <p data-selected-fragment>Selected fragment</p>
        </Inspector>
      </>
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(host.querySelector('[data-selected-fragment]')).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-open-track]')!.click());
    expect(host.querySelector('[data-track-document]')).not.toBeNull();
    expect(host.querySelector('[data-selected-fragment]')).toBeNull();
    expect(
      host.querySelectorAll('[data-ui="gallery.videoReview.inspectorNavigation"] button')
    ).toHaveLength(3);
    await act(async () => host.querySelector<HTMLButtonElement>('[data-select-text]')!.click());
    expect(host.querySelector('[data-track-document]')).toBeNull();
    expect(host.querySelector('[data-selected-fragment]')).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-open-track]')!.click());
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[title="gallery.videoReview.scene"]')!.click()
    );
    expect(host.textContent).toContain('Scene controls');
    expect(host.querySelector('[title="gallery.videoReview.textTrackDocument"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
