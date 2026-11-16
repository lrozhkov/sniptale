// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewTrackItemsInspector } from './track-items-inspector';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import type { QuickEditTrack } from '../../features/video/review/advanced/types';
const renderProbe = vi.hoisted(() => ({ inactiveLabels: 0 }));
vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => {
    if (key === 'gallery.videoReview.trackItemInactive') renderProbe.inactiveLabels++;
    return key;
  },
}));

it('navigates source and authored rows, filters, pages and removes through the accepted session', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  const scroll = vi.fn();
  const originalScroll = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = scroll;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  advanced.zoom.regions = Array.from({ length: 55 }, (_, i) => ({
    ...createQuickEditZoomRegion({ id: `focus${i}`, at: i, duration: 0.5 }),
    ...(i === 1 ? { dormant: true } : {}),
  }));
  const documentState = {
    advancedContent: advanced,
    edits: [{ id: 'edit', kind: 'speed', start: 1, end: 2, rate: 2 }],
    annotations: [],
    canvasComments: [],
  };
  const commit = vi.fn(async (operation) => {
    if (operation.target === 'advancedContent') documentState.advancedContent = operation.after;
    else documentState.edits = documentState.edits.filter((e) => e.id !== operation.before.id);
  });
  const selected = vi.fn(),
    section = vi.fn(),
    seek = vi.fn(),
    flush = vi.fn();
  const props = {
    track: 'zoom',
    state: {
      advanced,
      activeSelection: { kind: 'zoom', id: 'focus1' },
      snapshot: { document: documentState, snapshot: { workspace: {} } },
      video: { current: { pause: vi.fn() } },
      seek,
      setActiveSelection: selected,
      beforeAction: (action: () => void) => action(),
      canStart: () => true,
      editing: { exporter: { phase: 'idle' } },
      annotationEffects: { pending: false, flush },
      flushAdvanced: flush,
      run: async (action: () => Promise<void>) => action(),
      session: { getSnapshot: () => ({ document: documentState }), commit },
    },
    resource: {
      source: { duration: 60, width: 1280, height: 720, mimeType: 'video/mp4', size: 1 },
      filename: 'capture.mp4',
    },
    audio: { assets: new Map() },
    navigation: { shown: 'track', setSection: section },
  } as unknown as Parameters<typeof ReviewTrackItemsInspector>[0];
  const render = (track: QuickEditTrack) =>
    act(() => root.render(<ReviewTrackItemsInspector {...props} key={track} track={track} />));
  const click = (key: string) =>
    act(async () =>
      host.querySelector<HTMLButtonElement>(`[aria-label="gallery.videoReview.${key}"]`)!.click()
    );
  const toggle = (index: number) =>
    act(() => host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[index]!.click());
  try {
    render('zoom');
    expect(host.querySelectorAll('[data-track-item]')).toHaveLength(50);
    const renderedLabels = renderProbe.inactiveLabels;
    expect(renderedLabels).toBeGreaterThan(0);
    const currentSelect = vi.fn();
    props.state = { ...props.state, setActiveSelection: currentSelect };
    render('zoom');
    expect(renderProbe.inactiveLabels).toBe(renderedLabels);
    await act(async () =>
      host.querySelector<HTMLButtonElement>('.review-track-items-open')!.click()
    );
    expect(currentSelect).toHaveBeenCalledWith({ kind: 'zoom', id: 'focus0' });
    props.state = { ...props.state, setActiveSelection: selected };
    render('zoom');

    await click('trackItemsMore');
    expect(host.querySelectorAll('[data-track-item]')).toHaveLength(55);
    await act(async () =>
      host.querySelector<HTMLButtonElement>('.review-track-items-open')!.click()
    );
    expect(selected).toHaveBeenCalledWith({ kind: 'zoom', id: 'focus0' });
    expect(seek).not.toHaveBeenCalled();
    expect(section).toHaveBeenCalledWith('selected');
    toggle(1);
    toggle(2);
    expect(host.querySelectorAll('[data-selected]')).toHaveLength(2);
    await click('trackItemsClearSelection');
    expect(host.querySelectorAll('[data-selected]')).toHaveLength(0);
    const search = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        search,
        'not-found'
      );
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(host.querySelectorAll('[data-track-item]')).toHaveLength(0);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, '');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    toggle(0);
    expect(host.querySelectorAll('[data-selected]')).toHaveLength(50);
    await click('trackItemsDeleteSelected');
    expect(documentState.advancedContent.zoom.regions).toEqual([]);
    expect(flush).toHaveBeenCalledTimes(2);
    render('source');
    expect(host.querySelectorAll('[data-track-item]')).toHaveLength(2);
    await act(async () =>
      host.querySelector<HTMLButtonElement>('.review-track-items-open')!.click()
    );
    expect(section).toHaveBeenLastCalledWith('track');
    toggle(0);
    await click('trackItemsDeleteSelected');
    expect(documentState.edits).toEqual([]);
    render('music');
    expect(host.textContent).toContain('gallery.videoReview.trackItemsEmpty');
  } finally {
    act(() => root.unmount());
    host.remove();
    Element.prototype.scrollIntoView = originalScroll;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
