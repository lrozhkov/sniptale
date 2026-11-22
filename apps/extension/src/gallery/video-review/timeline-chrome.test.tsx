// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  ReviewHistoryControls,
  ReviewRuler,
  ReviewRulerRow,
  ReviewPlayhead,
  ReviewToolbar,
} from './timeline-chrome';

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
    expect(autosave.nextElementSibling?.getAttribute('data-compact-only')).toBe('true');
    expect(host.querySelector('[aria-label="gallery.videoReview.addComment"]')).toBeNull();
    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe(
      'gallery.videoReview.undo'
    );
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
    expect(host.querySelector('[data-ui="gallery.videoReview.moreActions"]')).not.toBeNull();
    expect(host.querySelector('[data-toolbar-side="trailing"]')?.textContent).toContain('History');
    expect(host.querySelector('[data-toolbar-transport]')?.textContent).toContain('0:00.00');
    const start = host.querySelector<HTMLButtonElement>(
      '[aria-label="gallery.videoReview.timelineStart"]'
    )!;
    const play = host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.play"]')!;
    const end = host.querySelector<HTMLButtonElement>(
      '[aria-label="gallery.videoReview.timelineEnd"]'
    )!;
    const sample = () =>
      host.querySelector('.review-playback-clock > [aria-hidden="true"]')!.textContent;
    act(() => root.render(<ReviewToolbar {...props} duration={599.999} />));
    expect(sample()).toBe('88:88.88 / 10:00.00');
    act(() => root.render(<ReviewToolbar {...props} duration={599.999} time={599.994} />));
    expect(sample()).toBe('88:88.88 / 10:00.00');
    expect(host.querySelector('.review-playback-clock-value')?.textContent).toBe(
      '9:59.99 / 10:00.00'
    );
    act(() => root.render(<ReviewToolbar {...props} />));
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
    expect(
      host.querySelector('[aria-label="gallery.videoReview.fit"] [data-review-toolbar-label]')
    ).toBeNull();
    act(() =>
      root.render(
        <ReviewToolbar
          {...props}
          time={3}
          resultDuration={8}
          playbackRange={{ start: 1, end: 2 }}
        />
      )
    );
    expect(host.querySelector('[data-toolbar-transport]')?.textContent).toContain(
      '0:01.00 – 0:02.00'
    );
    expect(host.querySelector('[data-toolbar-transport]')?.textContent).not.toContain('0:03.00');
    expect(host.querySelector('[title="gallery.videoReview.resultDuration"]')).toBeNull();
    act(() =>
      root.render(<ReviewToolbar {...props} utilityControls={<button>Project utilities</button>} />)
    );
    expect(host.querySelector('[data-ui="gallery.videoReview.moreActions"]')).toBeNull();
    expect(host.querySelector('[data-toolbar-side="trailing"]')?.textContent).toContain(
      'Project utilities'
    );
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('keeps ruler and lane markers aligned across source-time bounds without capturing input', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    for (const [time, left] of [
      [-1, 187],
      [5, 587],
      [11, 987],
    ]) {
      const geometry = { time: time!, duration: 10, gutter: 192, width: 800 };
      act(() =>
        root.render(
          <>
            <ReviewRulerRow {...geometry} controls={<button>Tracks</button>} interaction={{}} />
            <ReviewPlayhead {...geometry} />
          </>
        )
      );
      const cap = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.rulerPlayhead"]')!;
      const lane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.playhead"]')!;
      expect(cap.style.transform).toBe(`translateX(${left}px)`);
      expect(cap.style.left).toBe('0px');
      expect(lane.style.transform).toBe(cap.style.transform);
      expect(cap.classList.contains('bottom-0')).toBe(true);
      expect(lane.classList.contains('bottom-2')).toBe(true);
      for (const marker of [cap, lane]) {
        expect(marker.getAttribute('aria-hidden')).toBe('true');
        expect(marker.classList.contains('pointer-events-none')).toBe(true);
      }
    }
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('moves the playhead on published frames without a React render and preserves paused navigation', async () => {
  const { ReviewPlaybackPresentationClockContext } = await import('./playback-presentation-clock');
  const { createReviewPlaybackPresentationClock } =
    await import('./playback-presentation-clock.test-support');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let playing = true,
    renders = 0;
  const clock = createReviewPlaybackPresentationClock(() => playing);
  const host = document.createElement('div'),
    root = createRoot(host);
  const render = (time: number) =>
    act(() =>
      root.render(
        <ReviewPlaybackPresentationClockContext.Provider value={clock}>
          <Counter time={time} />
        </ReviewPlaybackPresentationClockContext.Provider>
      )
    );
  function Counter({ time }: { time: number }) {
    renders++;
    return <ReviewPlayhead time={time} duration={10} gutter={100} width={1000} />;
  }
  try {
    render(0);
    const playhead = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.playhead"]')!;
    const count = renders;
    clock.publish(2);
    expect(playhead.style.transform).toBe('translateX(295px)');
    expect(renders).toBe(count);
    clock.publish(3);
    render(1);
    expect(playhead.style.transform).toBe('translateX(395px)');
    playing = false;
    render(6);
    expect(playhead.style.transform).toBe('translateX(695px)');
    clock.publish(7);
    expect(playhead.style.transform).toBe('translateX(695px)');
    act(() => root.unmount());
    expect(() => clock.publish(8)).not.toThrow();
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('updates the clock from presented frames without a root render and rejects stale React time', async () => {
  const { ReviewPlaybackPresentationClockContext } = await import('./playback-presentation-clock');
  const { createReviewPlaybackPresentationClock } =
    await import('./playback-presentation-clock.test-support');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  let playing = true;
  const clock = createReviewPlaybackPresentationClock(() => playing);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  let renders = 0;
  function View({ time, duration = 10 }: { time: number; duration?: number }) {
    renders++;
    return (
      <ReviewToolbar
        time={time}
        duration={duration}
        playing={playing}
        onPlay={vi.fn()}
        onNavigate={vi.fn()}
        onZoom={vi.fn()}
        zoom={1}
        navigation={{ start: 0, end: duration }}
      />
    );
  }
  const render = (time: number, duration = 10) =>
    act(() =>
      root.render(
        <ReviewPlaybackPresentationClockContext.Provider value={clock}>
          <View time={time} duration={duration} />
        </ReviewPlaybackPresentationClockContext.Provider>
      )
    );
  const mutations = new MutationObserver(() => {});
  try {
    render(0);
    const readout = host.querySelector('.review-playback-clock-value')!;
    const text = readout.firstChild;
    expect(text).toBeInstanceOf(Text);
    mutations.observe(readout, { subtree: true, characterData: true, childList: true });
    const count = renders;
    clock.publish(2.34);
    expect(readout.textContent).toBe('0:02.34 / 0:10.00');
    expect(readout.firstChild).toBe(text);
    expect(renders).toBe(count);
    clock.publish(3.45);
    render(1);
    expect(readout.textContent).toBe('0:03.45 / 0:10.00');
    render(1, 20);
    expect(readout.textContent).toBe('0:03.45 / 0:20.00');
    playing = false;
    render(6);
    clock.publish(7);
    expect(readout.textContent).toBe('0:06.00 / 0:10.00');
    expect(readout.firstChild).toBe(text);
    expect(text?.isConnected).toBe(true);
    const records = mutations.takeRecords();
    expect(records.length).toBeGreaterThan(0);
    expect(
      records.every((record) => record.type === 'characterData' && record.target === text)
    ).toBe(true);
  } finally {
    mutations.disconnect();
    act(() => root.unmount());
    expect(() => clock.publish(8)).not.toThrow();
    host.remove();
    vi.unstubAllGlobals();
  }
});
