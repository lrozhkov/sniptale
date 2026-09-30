// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewHistoryControls, ReviewRuler, ReviewToolbar } from './timeline-chrome';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('groups compact history and autosave with equal short separators', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const props: Parameters<typeof ReviewHistoryControls>[0] = {
    busy: false,
    cursor: 0,
    length: 0,
    onHistory: vi.fn(),
    autosave: {
      enabled: true,
      error: null,
      errorMessage: null,
      dirty: false,
      saving: false,
      busy: false,
      onReload: async () => {},
      onChange: vi.fn(),
    },
  };
  try {
    act(() => root.render(<ReviewHistoryControls {...props} />));
    const autosave = host.querySelector('[data-ui="autosave-control"]')!;
    expect(autosave.previousElementSibling?.getAttribute('data-ui')).toBe(
      'gallery.videoReview.toolbar.separator'
    );
    expect(autosave.nextElementSibling?.getAttribute('data-ui')).toBe(
      'gallery.videoReview.toolbar.separator'
    );
    const separators = host.querySelectorAll('[data-ui="gallery.videoReview.toolbar.separator"]');
    expect(separators).toHaveLength(2);
    for (const separator of separators) {
      expect(separator.classList.contains('h-4')).toBe(true);
      expect(separator.classList.contains('self-center')).toBe(true);
      expect(separator.getAttribute('aria-hidden')).toBe('true');
    }
    act(() =>
      root.render(
        <ReviewHistoryControls
          busy={props.busy}
          cursor={props.cursor}
          length={props.length}
          onHistory={props.onHistory}
        />
      )
    );
    expect(host.querySelector('[data-ui="gallery.videoReview.toolbar.separator"]')).toBeNull();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('renders major ruler labels at coarse and fine zoom scales', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    act(() => root.render(<ReviewRuler duration={10} width={200} />));
    const ruler = host.querySelector('[data-ui="gallery.videoReview.ruler"]')!;
    expect(ruler.querySelectorAll('span').length).toBeGreaterThan(0);
    expect(ruler.querySelectorAll('[style*="height: 4px"]').length).toBeGreaterThan(0);
    act(() => root.render(<ReviewRuler duration={1} width={1200} />));
    expect(ruler.querySelectorAll('span').length).toBeGreaterThan(0);
    expect(ruler.querySelectorAll('[style*="height: 9px"]').length).toBeGreaterThan(0);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('keeps compact toolbar transport and zoom actions usable in playing and stopped states', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const onPlay = vi.fn();
  const onNavigate = vi.fn();
  const onZoom = vi.fn();
  const props: Parameters<typeof ReviewToolbar>[0] = {
    duration: 10,
    time: 0,
    playing: false,
    historyControls: <button type="button">History</button>,
    tools: <button type="button">Tools</button>,
    onPlay,
    navigation: { start: 0, end: 10 },
    onNavigate,
    zoom: 1,
    onZoom,
  };
  try {
    act(() => root.render(<ReviewToolbar {...props} />));
    expect(host.querySelector('[data-toolbar-side="leading"]')?.textContent).toBe('Tools');
    expect(host.querySelector('[data-toolbar-side="trailing"]')?.textContent).toContain('History');
    expect(host.querySelector('[data-toolbar-transport]')?.textContent).toContain('0:00.00');
    const start = host.querySelector<HTMLButtonElement>(
      '[aria-label="gallery.videoReview.timelineStart"]'
    )!;
    const play = host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.play"]')!;
    const end = host.querySelector<HTMLButtonElement>(
      '[aria-label="gallery.videoReview.timelineEnd"]'
    )!;
    expect(start.disabled).toBe(true);
    act(() => play.click());
    act(() => end.click());
    expect(onPlay).toHaveBeenCalledOnce();
    expect(onNavigate).toHaveBeenCalledWith(10);
    act(() => root.render(<ReviewToolbar {...props} time={10} playing resultDuration={8} />));
    expect(end.disabled).toBe(true);
    expect(host.querySelector('[aria-label="gallery.videoReview.pause"]')).not.toBeNull();
    expect(host.querySelector('[title="gallery.videoReview.resultDuration"]')).not.toBeNull();
    act(() => start.click());
    expect(onNavigate).toHaveBeenCalledWith(0);
    act(() =>
      host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.fit"]')!.click()
    );
    expect(onZoom).toHaveBeenCalledWith(1);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
