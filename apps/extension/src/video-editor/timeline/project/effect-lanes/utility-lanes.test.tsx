import {
  createQuickEditBorder,
  createQuickEditSpotlight,
} from '../../../../features/video/project/scene/focus-appearance';
import { translate } from '../../../../platform/i18n';
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import { VideoTemporalEasing } from '../../../../features/video/project/types';
import { ProjectTimelineEffectCanvasRows } from './utility-lanes';

it.each([
  { locked: false, withBorder: false, spotlight: true },
  { locked: true, withBorder: false, spotlight: true },
  { locked: false, withBorder: false },
  { locked: true, withBorder: false },
  { locked: false, withBorder: true },
  { locked: true, withBorder: true },
])(
  'adds camera connections through their button; locked=$locked, border=$withBorder, spotlight=$spotlight',
  ({ locked, withBorder, spotlight }) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const project = createEmptyVideoProject();
    project.duration = 8;
    project.motionRegions = [
      { ...createVideoProjectMotionRegion(project, 0), id: 'first', startTime: 0, duration: 1 },
      { ...createVideoProjectMotionRegion(project, 4), id: 'second', startTime: 4, duration: 1 },
    ];
    if (spotlight)
      for (const region of project.motionRegions) {
        region.spotlight = createQuickEditSpotlight();
        region.spotlightTarget = 'viewport';
      }
    if (withBorder)
      project.motionRegions.push({
        ...createVideoProjectMotionRegion(project, 2),
        id: 'intervening-border',
        startTime: 2,
        duration: 1,
        border: createQuickEditBorder(),
        borderTarget: 'viewport',
      });
    project.utilityLanes = {
      camera: { visible: true, locked },
      actions: { visible: true, locked: false },
    };
    const host = document.createElement('div');
    const root = createRoot(host);
    const connect = vi.fn();
    const select = vi.fn();
    const seek = vi.fn();
    const render = () =>
      root.render(
        <ProjectTimelineEffectCanvasRows
          project={project}
          pixelsPerSecond={90}
          selectedEffectSelection={null}
          onBeginRangeSelection={seek}
          onBeginEffectInteraction={vi.fn()}
          onResizeMotionRegion={vi.fn()}
          onConnectMotionRegions={connect}
          onSelectMotionRegion={select}
        />
      );
    try {
      act(render);
      const gap = host.querySelector<HTMLElement>(
        '[data-ui="video-editor.timeline.framing-connection"]'
      )!;
      expect(gap).not.toBeNull();
      expect(
        gap.querySelector('[data-ui="video-editor.timeline.framing-connection-preview"]') !== null
      ).toBe(!locked);
      act(() => gap.click());
      expect(connect).not.toHaveBeenCalled();
      act(() => gap.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
      expect(seek).toHaveBeenCalledOnce();
      const button = gap.querySelector<HTMLButtonElement>('button')!;
      expect(button.getAttribute('data-timeline-object')).toBe('true');
      expect(button.disabled).toBe(locked);
      act(() => button.click());
      expect(connect).toHaveBeenCalledTimes(locked ? 0 : 1);
      if (!locked) expect(connect).toHaveBeenCalledWith('first', 'second');
      project.motionRegions[1]!.incomingConnection = {
        fromRegionId: 'first',
        easing: VideoTemporalEasing.EASE_IN_OUT,
      };
      act(render);
      const transition = host.querySelector<HTMLButtonElement>(
        '[data-ui="video-editor.timeline.framing-connection"]'
      )!;
      expect(transition.getAttribute('data-timeline-object')).toBe('true');
      seek.mockClear();
      act(() => transition.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
      act(() => transition.click());
      expect(select).toHaveBeenCalledWith('second', 'connection');
      expect(seek).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
      vi.unstubAllGlobals();
    }
  }
);

it.each(['border', 'spotlight'] as const)(
  'identifies a %s segment without dormant camera scale or connection',
  (kind) => {
    const project = createEmptyVideoProject('Border lane');
    project.duration = 4;
    project.motionRegions = [
      {
        ...createVideoProjectMotionRegion(project, 0),
        id: 'border',
        duration: 2,
        border: createQuickEditBorder(),
        borderTarget: 'viewport',
      },
    ];
    if (kind === 'spotlight') {
      const region = project.motionRegions[0]!;
      delete region.border;
      delete region.borderTarget;
      region.spotlight = createQuickEditSpotlight();
      region.spotlightTarget = 'viewport';
    }
    const host = document.createElement('div');
    const root = createRoot(host);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    try {
      act(() =>
        root.render(
          <ProjectTimelineEffectCanvasRows
            project={project}
            pixelsPerSecond={90}
            selectedEffectSelection={null}
            onBeginRangeSelection={vi.fn()}
            onBeginEffectInteraction={vi.fn()}
            onResizeMotionRegion={vi.fn()}
          />
        )
      );
      const segment = host.querySelector('[data-timeline-effect-segment="border"]')!;
      expect(segment.textContent).toContain(
        translate(
          kind === 'border'
            ? 'gallery.videoReview.focusBorder'
            : 'gallery.videoReview.focusSpotlight'
        )
      );
      expect(
        segment.querySelector(kind === 'border' ? '.lucide-frame' : '.lucide-focus')
      ).not.toBeNull();
      expect(segment.textContent).not.toContain('1.35x');
      expect(host.querySelector('[data-ui="video-editor.timeline.framing-connection"]')).toBeNull();
    } finally {
      act(() => root.unmount());
      vi.unstubAllGlobals();
    }
  }
);
