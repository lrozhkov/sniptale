// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import type { TimelineTrackLayout } from '../../tracks/layout';
import { ProjectTimelineLogicalLaneGuides } from './lane-guides';

it('renders logical lane separators plus template and transition gutter guides', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(<ProjectTimelineLogicalLaneGuides trackLayout={createTrackLayout()} />);
  });

  expect(container.querySelectorAll('[data-project-timeline-template-sublane-guide]')).toHaveLength(
    2
  );
  expect(container.querySelector('[data-project-timeline-transition-gutter]')).not.toBeNull();

  act(() => root.unmount());
});

function createTrackLayout(): TimelineTrackLayout {
  return {
    center: 89,
    clipRowHeight: 62,
    junctionZones: [],
    logicalLaneMetrics: createLaneMetrics(),
    logicalRowHeight: 89,
    logicalRows: 2,
    rowHeight: 178,
    top: 0,
    trackBaseRowHeight: 62,
    trackId: 'track-1',
    transitionRowCount: 0,
  };
}

function createLaneMetrics(): TimelineTrackLayout['logicalLaneMetrics'] {
  return new Map([
    [
      'line-1',
      {
        clipRowHeight: 62,
        clipTop: 36,
        logicalLaneId: 'line-1',
        rowHeight: 98,
        rowIndex: 0,
        rowTop: 0,
        templateLaneAreaHeight: 18,
        transitionBoundaryGutterHeight: 18,
      },
    ],
    [
      'line-2',
      {
        clipRowHeight: 62,
        clipTop: 116,
        logicalLaneId: 'line-2',
        rowHeight: 80,
        rowIndex: 1,
        rowTop: 98,
        templateLaneAreaHeight: 18,
        transitionBoundaryGutterHeight: 0,
      },
    ],
  ]);
}
