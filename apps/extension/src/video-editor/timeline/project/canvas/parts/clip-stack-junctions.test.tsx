// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { createTextClip } from '../../../../../features/video/project/factories/overlay-clip';
import * as junctions from '../../../../../features/video/project/transition/junctions';
import type { VideoProject } from '../../../../../features/video/project/types';
import { buildTimelineTrackLayoutModel } from '../../tracks/layout';
import { ProjectTimelineTrackClipStack } from './clip-stack';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function createFixture(count: number) {
  const project = createEmptyVideoProject('Timeline render');
  const trackId = project.tracks[0]!.id;
  project.clips = Array.from({ length: count }, (_, i) => ({
    ...createTextClip(trackId, project.width, project.height, i * 8),
    id: `clip-${i}`,
    duration: 8,
  }));
  project.duration = count * 8;
  return project;
}

function renderStack() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = (current: VideoProject) => {
    const trackId = current.tracks[0]!.id;
    const layout = buildTimelineTrackLayoutModel({
      project: current,
      tracks: current.tracks,
      trackHeightByTrackId: {},
    }).layoutByTrackId.get(trackId);
    return () =>
      act(() =>
        root.render(
          <ProjectTimelineTrackClipStack
            project={current}
            trackId={trackId}
            trackLayout={layout}
            hoveredClipId={null}
            selectedClipId={null}
            selectedEffectSelection={null}
            timelinePreviews={{}}
            pixelsPerSecond={10}
            trackLocked={false}
            onBeginClipInteraction={vi.fn()}
            onBeginEffectInteraction={vi.fn()}
            onSelectClip={vi.fn()}
            onSetHoveredClipId={vi.fn()}
          />
        )
      );
  };
  return {
    container,
    prepare: render,
    dispose: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

it.each([0, 3, 240])('bounds junction scans for a rendered stack of %i clips', (count) => {
  const project = createFixture(count);
  const view = renderStack();
  const render = view.prepare(project);
  const scan = vi.spyOn(junctions, 'getTrackJunctions');
  try {
    render();
    expect(view.container.querySelectorAll('[data-project-timeline-clip]')).toHaveLength(count);
    expect(scan).toHaveBeenCalledTimes(count ? 1 : 0);
  } finally {
    scan.mockRestore();
    view.dispose();
  }
});

it('updates overlapping insets after edits and restores the prior geometry', () => {
  const project = createFixture(3);
  project.clips[0]!.duration = 10;
  const view = renderStack();
  const inset = () => {
    const clip = view.container.querySelector<HTMLElement>('[data-project-timeline-clip="clip-1"]');
    expect(clip).not.toBeNull();
    return clip!.style.getPropertyValue('--timeline-item-inset-left');
  };
  try {
    view.prepare(project)();
    expect(inset()).toBe('10px');
    const changed = {
      ...project,
      clips: project.clips.map((clip, i) => (i === 0 ? { ...clip, duration: 12 } : clip)),
    };
    view.prepare(changed)();
    expect(inset()).toBe('20px');
    view.prepare(project)();
    expect(inset()).toBe('10px');
    project.clips[1]!.startTime = 10;
    view.prepare(project)();
    expect(inset()).toBe('0px');
  } finally {
    view.dispose();
  }
});
