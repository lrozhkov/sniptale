// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { resolveTimelineTrackScrollTop, syncTimelineTrackScrollIntoView } from './scroll-sync';

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

function createScrollableNode(params: { clientHeight: number; scrollTop: number }) {
  const node = document.createElement('div');
  Object.defineProperty(node, 'clientHeight', {
    configurable: true,
    value: params.clientHeight,
  });
  node.scrollTop = params.scrollTop;
  return node;
}
