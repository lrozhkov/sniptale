// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import {
  resolveTimelineTrackScrollTop,
  syncTimelineTrackScrollIntoView,
  useProjectTimelineScrollSync,
} from './scroll-sync';

describe('resolveTimelineTrackScrollTop', () => {
  it('keeps the current scroll when the selected track is already visible', () => {
    expect(
      resolveTimelineTrackScrollTop({
        currentScrollTop: 48,
        viewportHeight: 180,
        trackTop: 60,
        trackHeight: 80,
      })
    ).toBe(48);
  });

  it('scrolls down when the selected track is below the visible viewport', () => {
    expect(
      resolveTimelineTrackScrollTop({
        currentScrollTop: 0,
        viewportHeight: 160,
        trackTop: 220,
        trackHeight: 72,
      })
    ).toBe(132);
  });

  it('scrolls up when the selected track is above the visible viewport', () => {
    expect(
      resolveTimelineTrackScrollTop({
        currentScrollTop: 180,
        viewportHeight: 160,
        trackTop: 72,
        trackHeight: 64,
      })
    ).toBe(72);
  });
});

describe('syncTimelineTrackScrollIntoView', () => {
  it('scrolls the track rail and timeline canvas to the same selected track viewport', () => {
    const trackList = createScrollableNode({ clientHeight: 160, scrollTop: 0 });
    const timeline = createScrollableNode({ clientHeight: 160, scrollTop: 0 });

    const didScroll = syncTimelineTrackScrollIntoView({
      timeline,
      trackHeight: 72,
      trackList,
      trackTop: 220,
    });

    expect(didScroll).toBe(true);
    expect(trackList.scrollTop).toBe(132);
    expect(timeline.scrollTop).toBe(132);
  });
});

it('accepts new input from either pane and ignores delayed mirror acknowledgements', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const hook: { current: ReturnType<typeof useProjectTimelineScrollSync> | null } = {
    current: null,
  };
  function Harness() {
    hook.current = useProjectTimelineScrollSync();
    return null;
  }
  try {
    act(() => root.render(createElement(Harness)));
    const scroll = hook.current;
    if (!scroll) throw new Error('Missing scroll owner');
    const trackList = createScrollableNode({ clientHeight: 160, scrollTop: 0 });
    const timeline = createScrollableNode({ clientHeight: 160, scrollTop: 0 });
    scroll.trackListRef.current = trackList;
    scroll.timelineRef.current = timeline;

    trackList.scrollTop = 80;
    scroll.syncTracksScroll('tracks');
    expect(timeline.scrollTop).toBe(80);

    timeline.scrollTop = 120;
    scroll.syncTracksScroll('timeline');
    expect(trackList.scrollTop).toBe(120);

    // A browser may deliver the rail's programmatic scroll event after the canvas input.
    scroll.syncTracksScroll('tracks');
    expect(timeline.scrollTop).toBe(120);

    trackList.scrollTop = 155;
    scroll.syncTracksScroll('tracks');
    expect(timeline.scrollTop).toBe(155);
    scroll.syncTracksScroll('timeline');
    expect(trackList.scrollTop).toBe(155);

    timeline.scrollTop = 75;
    scroll.syncTracksScroll('timeline');
    expect(trackList.scrollTop).toBe(75);
    scroll.syncTracksScroll('tracks');
    expect(timeline.scrollTop).toBe(75);
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

function createScrollableNode(params: { clientHeight: number; scrollTop: number }) {
  const node = document.createElement('div');
  Object.defineProperty(node, 'clientHeight', {
    configurable: true,
    value: params.clientHeight,
  });
  node.scrollTop = params.scrollTop;
  return node;
}
