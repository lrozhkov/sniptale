// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import { VideoTemporalEasing } from '../../../../features/video/project/types';
import { ProjectTimelineEffectCanvasRows } from './utility-lanes';

it.each([false, true])(
  'adds a transition only through its centered button; locked=%s',
  (locked) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const project = createEmptyVideoProject();
    project.duration = 8;
    project.motionRegions = [
      { ...createVideoProjectMotionRegion(project, 0), id: 'first', startTime: 0, duration: 1 },
      { ...createVideoProjectMotionRegion(project, 4), id: 'second', startTime: 4, duration: 1 },
    ];
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
      act(() => gap.click());
      expect(connect).not.toHaveBeenCalled();
      act(() => gap.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
      expect(seek).toHaveBeenCalledOnce();
      const button = gap.querySelector<HTMLButtonElement>('button')!;
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
      act(() => transition.click());
      expect(select).toHaveBeenCalledWith('second', 'connection');
    } finally {
      act(() => root.unmount());
      vi.unstubAllGlobals();
    }
  }
);
