// @vitest-environment jsdom
import {
  createQuickEditBorder,
  createQuickEditSpotlight,
} from '../../features/video/project/scene/focus-appearance';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { reviewStagePickRegions, ReviewStageFocusTargets } from './stage-focus';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';

import { buildReviewTimeMap } from '../../features/video/review/timeline';

it('picks the authored region after cut and speed slices, excluding cut-hidden and dormant regions', () => {
  const map = buildReviewTimeMap(10, [
    { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
    {
      id: 'speed',
      kind: 'speed',
      start: 4,
      end: 8,
      requestedStart: 4,
      requestedEnd: 8,
      rate: 2,
      audio: 'speed',
    },
  ]);
  const border = {
    ...createQuickEditZoomRegion({ id: 'authored', at: 0, duration: 8 }),
    border: createQuickEditBorder(),
    sourceAnchor: { start: 0, end: 8 },
  };
  const hidden = { ...border, id: 'hidden', sourceAnchor: { start: 2, end: 4 } };
  expect(
    reviewStagePickRegions(
      [border, hidden, { ...border, id: 'dormant', dormant: true }],
      map,
      3
    ).map((region) => region.id)
  ).toEqual(['authored']);
  expect(reviewStagePickRegions([border], map, 5)).toEqual([]);
});
it('places keyboard-accessible targets over the decorated window and excludes the selected object', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'),
    root = createRoot(host),
    select = vi.fn();
  const a = {
    ...createQuickEditZoomRegion({ id: 'a', at: 0 }),
    border: { ...createQuickEditBorder(), area: { x: 0, y: 0, width: 0.5, height: 0.2 } },
  };
  try {
    act(() =>
      root.render(
        <ReviewStageFocusTargets
          video={{ x: 30, y: 10, width: 400, height: 300 }}
          output={{ width: 500, height: 400 }}
          clip={{ rect: { x: 30, y: 10, width: 400, height: 300 }, radius: 8 }}
          selectedId="selected"
          picker={{
            regions: [
              a,
              { ...a, id: 'selected' },
              createQuickEditZoomRegion({ id: 'camera', at: 0 }),
            ],
            onSelect: select,
          }}
        />
      )
    );
    const button = host.querySelectorAll('button')[1]!;
    expect(host.querySelectorAll('button')).toHaveLength(2);
    expect(host.querySelector('div')!.style.clipPath).toBe('inset(10px 70px 90px 30px round 8px)');
    expect(host.querySelector('button')!.style.width).toBe('400px');
    expect([button.style.left, button.style.top, button.style.width, button.style.height]).toEqual([
      '30px',
      '10px',
      '200px',
      '60px',
    ]);
    act(() => button.click());
    expect(select).toHaveBeenCalledWith('a');
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('matches the unselected circular lens target to its physical circle bounds', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'),
    root = createRoot(host);
  const region = {
    ...createQuickEditZoomRegion({ id: 'circle', at: 0 }),
    spotlight: {
      ...createQuickEditSpotlight(),
      effect: 'magnify' as const,
      lensShape: 'circle' as const,
    },
  };
  try {
    act(() =>
      root.render(
        <ReviewStageFocusTargets
          video={{ x: 0, y: 0, width: 400, height: 200 }}
          output={{ width: 400, height: 200 }}
          picker={{ regions: [region], onSelect: vi.fn() }}
        />
      )
    );
    const button = host.querySelector('button')!;
    expect([button.style.left, button.style.top, button.style.width, button.style.height]).toEqual([
      '150px',
      '50px',
      '100px',
      '100px',
    ]);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
