// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { buildTimelineTrackLayoutModel } from '../tracks/layout';
import { useTimelineSelectedTrackAutoScroll } from './selected-track-scroll';

function mount() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'),
    surface = document.createElement('div');
  const timeline = document.createElement('div'),
    trackList = document.createElement('div');
  host.append(surface, timeline, trackList);
  document.body.append(host);
  timeline.getBoundingClientRect = () => new DOMRect(0, 0, 600, 180);
  Object.defineProperty(trackList, 'clientHeight', { value: 150 });
  Object.defineProperty(timeline, 'clientHeight', { value: 180 });
  timeline.scrollTop = trackList.scrollTop = 143;
  const project = createEmptyVideoProject('Selected FX');
  const trackId = project.tracks[0]!.id;
  const model = buildTimelineTrackLayoutModel({
    project,
    tracks: project.tracks,
    trackHeightByTrackId: {},
  });
  model.layoutByTrackId.set(trackId, {
    ...model.layoutByTrackId.get(trackId)!,
    top: 17,
    rowHeight: 126,
  });
  const params: Parameters<typeof useTimelineSelectedTrackAutoScroll>[0] = {
    selection: { kind: 'scene' },
    selectedTrackId: null,
    timelineRef: { current: timeline },
    trackListRef: { current: trackList },
    trackLayoutModel: model,
  };
  const root = createRoot(surface);
  function Harness() {
    useTimelineSelectedTrackAutoScroll(params);
    return null;
  }
  const render = () => act(() => root.render(<Harness />));
  const addFx = (id: string, top: number, height: number) => {
    const node = document.createElement('div');
    node.dataset['clipFx'] = id;
    node.getBoundingClientRect = () => new DOMRect(0, top, 500, height);
    timeline.append(node);
  };
  render();
  return {
    params,
    trackId,
    timeline,
    trackList,
    render,
    addFx,
    dispose: () => {
      act(() => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    },
  };
}

it.each([12, 20])(
  'keeps the visible %spx FX press target stable and reveals another effect on the same track',
  (height) => {
    const fixture = mount();
    const { params, trackId, timeline, trackList, render, addFx } = fixture;
    try {
      addFx('pressed', 80, height);
      params.selectedTrackId = trackId;
      params.selection = { kind: 'effect-instance', effectInstanceId: 'pressed' };
      render();
      // The whole track begins above the viewport, but its selected FX is already visible.
      expect(timeline.scrollTop).toBe(143);
      expect(trackList.scrollTop).toBe(143);
      addFx('keyboard-target', 220, height);
      params.selection = { kind: 'effect-instance', effectInstanceId: 'keyboard-target' };
      render();
      expect(timeline.scrollTop).toBe(143 + 220 + height - 180);
      expect(trackList.scrollTop).toBe(timeline.scrollTop);
    } finally {
      fixture.dispose();
    }
  }
);

it('retains ordinary track reveal and does not overwrite later manual scrolling', () => {
  const fixture = mount();
  const { params, trackId, timeline, trackList, render } = fixture;
  try {
    params.selectedTrackId = trackId;
    params.selection = { kind: 'track', trackId };
    render();
    expect(timeline.scrollTop).toBe(17);
    expect(trackList.scrollTop).toBe(17);
    timeline.scrollTop = trackList.scrollTop = 97;
    render();
    expect(timeline.scrollTop).toBe(97);
    expect(trackList.scrollTop).toBe(97);
  } finally {
    fixture.dispose();
  }
});

it.each(['clip', 'clip-group'] as const)(
  'keeps a visible selected %s press target in place across history and lane offsets',
  (kind) => {
    const fixture = mount();
    const { params, trackId, timeline, trackList, render } = fixture;
    const clip = document.createElement('div');
    clip.dataset['projectTimelineClip'] = 'selected-clip';
    clip.getBoundingClientRect = () => new DOMRect(20, 60, 400, 44);
    timeline.append(clip);
    try {
      params.selectedTrackId = trackId;
      params.selection =
        kind === 'clip'
          ? { kind, clipId: 'selected-clip' }
          : { kind, clipIds: ['selected-clip', 'other'], anchorClipId: 'selected-clip' };
      render();
      expect(timeline.scrollTop).toBe(143);
      expect(trackList.scrollTop).toBe(143);
      timeline.scrollTop = trackList.scrollTop = 100;
      render();
      expect(timeline.scrollTop).toBe(100);
    } finally {
      fixture.dispose();
    }
  }
);

it('reveals another rendered clip on the same track without returning to the track origin', () => {
  const fixture = mount();
  const { params, trackId, timeline, trackList, render } = fixture;
  const first = document.createElement('div');
  first.dataset['projectTimelineClip'] = 'first';
  first.getBoundingClientRect = () => new DOMRect(20, 60, 400, 44);
  const next = document.createElement('div');
  next.dataset['projectTimelineClip'] = 'next';
  next.getBoundingClientRect = () => new DOMRect(20, 220, 400, 44);
  timeline.append(first, next);
  try {
    params.selectedTrackId = trackId;
    params.selection = { kind: 'clip', clipId: 'first' };
    render();
    timeline.scrollTop = trackList.scrollTop = 143;
    params.selection = { kind: 'clip', clipId: 'next' };
    render();
    expect(timeline.scrollTop).toBe(143 + 220 + 44 - 180);
    expect(trackList.scrollTop).toBe(timeline.scrollTop);
  } finally {
    fixture.dispose();
  }
});

it('keeps a visible pressed clip stable before the canvas scroll reaches the track rail', () => {
  const fixture = mount();
  const { params, trackId, timeline, trackList, render } = fixture;
  const clip = document.createElement('div');
  clip.dataset['projectTimelineClip'] = 'pressed';
  clip.getBoundingClientRect = () => new DOMRect(20, 58, 400, 44);
  timeline.append(clip);
  try {
    // Browser scroll-into-view occurs before its asynchronous scroll event mirrors the rail.
    timeline.scrollTop = 123;
    trackList.scrollTop = 2;
    params.selectedTrackId = trackId;
    params.selection = { kind: 'clip', clipId: 'pressed' };
    render();
    expect(timeline.scrollTop).toBe(123);
    expect(trackList.scrollTop).toBe(2);
  } finally {
    fixture.dispose();
  }
});

it.each(['motion-region', 'motion-connection'] as const)(
  'keeps a browser-revealed %s press stable instead of revealing the retained clip track',
  (kind) => {
    const fixture = mount();
    const { params, trackId, timeline, trackList, render } = fixture;
    try {
      const clip = document.createElement('div');
      clip.dataset['projectTimelineClip'] = 'primary';
      clip.getBoundingClientRect = () => new DOMRect(0, 80, 500, 30);
      timeline.append(clip);
      params.selectedTrackId = trackId;
      params.selection = { kind: 'clip', clipId: 'primary' };
      render();
      timeline.scrollTop = trackList.scrollTop = 310;
      params.selection = { kind, motionRegionId: 'focus' };
      render();
      expect(timeline.scrollTop).toBe(310);
      expect(trackList.scrollTop).toBe(310);
      params.selection = { kind: 'track', trackId };
      render();
      expect(timeline.scrollTop).toBe(17);
      expect(trackList.scrollTop).toBe(17);
    } finally {
      fixture.dispose();
    }
  }
);
