// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import type { ReviewEdit } from '../../features/video/review/types';
import { createQuickEditAudioClip } from '../../features/video/review/advanced/audio';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { ReviewIntervalMap, reviewIntervalDuration } from './interval-timing';
import { ReviewInterval } from './controls';
import { ReviewAudioClipEditor } from './audio-editor';
import { ReviewZoomInspector } from './zoom-inspector';

vi.mock('../../platform/i18n', async (original) => {
  const actual = await original<typeof import('../../platform/i18n')>();
  return {
    ...actual,
    useAppLocale: () => 'en',
    translate: (key: Parameters<typeof actual.translate>[0]) => actual.translate(key, 'en'),
  };
});

const speed = {
  id: 'speed',
  kind: 'speed',
  start: 2,
  end: 6,
  requestedStart: 2,
  requestedEnd: 6,
  rate: 2,
  audio: 'speed',
} satisfies ReviewEdit;
const cut = (start: number, end: number): ReviewEdit => ({
  id: 'cut',
  kind: 'cut',
  start,
  end,
  requestedStart: start,
  requestedEnd: end,
});
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});
function render(children: ReactNode, edits: readonly ReviewEdit[] = []) {
  act(() =>
    root.render(
      <ReviewIntervalMap.Provider value={buildReviewTimeMap(12, edits)}>
        {children}
      </ReviewIntervalMap.Provider>
    )
  );
}
const result = () => host.querySelector('[data-ui="gallery.videoReview.intervalResult"]');
const interval = () => host.querySelector('[data-ui="gallery.videoReview.interval"]')!;

it.each([
  [0, 8, [speed], 6],
  [3, 5, [speed], 1],
  [0, 2, [speed], 2],
  [0, 8, [speed, { ...speed, id: 'slow', start: 6, end: 8, rate: 0.5 }], 8],
  [0, 8, [speed, cut(1, 4)], 4],
  [2, 4, [cut(1, 6)], 0],
] as const)(
  'projects source interval %s–%s through visible slices',
  (start, end, edits, expected) => {
    expect(reviewIntervalDuration(start, end, buildReviewTimeMap(12, edits))).toBeCloseTo(expected);
  }
);

it('updates output duration after speed changes and undo without duplicating equal durations', () => {
  render(<ReviewInterval start={0} end={8} />, [speed]);
  expect(interval().textContent).toContain('Interval');
  expect(
    host.querySelector('[data-ui="gallery.videoReview.intervalValues"]')?.textContent
  ).toContain('0.0 – 8.0');
  expect(interval().textContent).toContain('8 s');
  expect(result()?.textContent).toContain('6 s');
  render(<ReviewInterval start={0} end={8} />);
  expect(result()).toBeNull();
  render(<ReviewInterval start={0} end={8} />, [{ ...speed, rate: 0.5 }]);
  expect(result()?.textContent).toContain('12 s');
});

it('hides rounding-only differences, distinguishes tiny nonzero durations and keeps points time-only', () => {
  render(<ReviewInterval start={1} end={2} resultDuration={0.9999999} />);
  expect(result()).toBeNull();
  render(<ReviewInterval start={1} end={1.001} resultDuration={0} />);
  expect(interval().textContent).toContain('<0.01 s');
  expect(result()?.textContent).toContain('0 s');
  render(<ReviewInterval start={2} end={2} />);
  expect(interval().textContent).toBe('Time2.0');
  expect(interval().querySelector('svg')).toBeNull();
});

it('does not apply video speed twice to result-time intervals', () => {
  render(<ReviewInterval start={2} end={6} timeBasis="result" />, [speed]);
  expect(interval().textContent).toContain('4 s');
  expect(result()).toBeNull();
});

it('projects legacy Focus result coordinates back to the source before displaying duration', () => {
  const region = createQuickEditZoomRegion({ id: 'z', at: 1, duration: 2, endMax: 6 });
  render(
    <ReviewZoomInspector region={region} onChange={vi.fn()} onReset={vi.fn()} onDelete={vi.fn()} />,
    [{ ...speed, start: 0, end: 12 }]
  );
  expect(interval().textContent).toContain('2.0 – 6.0');
  expect(interval().textContent).toContain('4 s');
  expect(result()?.textContent).toContain('2 s');
});

it('uses audible recording slices and keeps result-time music independent of video speed', () => {
  const clip = createQuickEditAudioClip({
    id: 'a',
    assetId: 'a',
    timelineStart: 0,
    duration: 6,
    endMax: 12,
  });
  render(
    <ReviewAudioClipEditor
      clip={{ ...clip, sourceAnchor: [{ start: 0, end: 6, offset: 0, duration: 6 }] }}
      lane="voiceover"
      busy={false}
      onPatch={vi.fn()}
      onDelete={vi.fn()}
    />,
    [{ ...speed, start: 0, end: 2 }, cut(2, 4)]
  );
  expect(interval().textContent).toContain('6 s');
  // Speed stretches the source footprint; six native seconds minus two cut seconds still sound for four.
  expect(result()?.textContent).toContain('4 s');
  render(
    <ReviewAudioClipEditor
      clip={{ ...clip, tempo: 2 }}
      lane="music"
      busy={false}
      onPatch={vi.fn()}
      onDelete={vi.fn()}
    />,
    [speed]
  );
  expect(result()?.textContent).toContain('3 s');
  render(
    <ReviewAudioClipEditor
      clip={clip}
      lane="music"
      busy={false}
      onPatch={vi.fn()}
      onDelete={vi.fn()}
    />,
    [speed]
  );
  expect(result()).toBeNull();
});
