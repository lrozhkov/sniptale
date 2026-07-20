import { describe, expect, it } from 'vitest';

import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
} from '../../../features/video/project/types/interaction';
import {
  findVisibleProjectActionEvent,
  getVisibleProjectActionEvents,
  hasVisibleProjectActionEvents,
} from './action-events';

function createProjectWithLegacyScroll() {
  const project = createEmptyVideoProject('Visible actions');
  project.actionEvents = [
    {
      data: {},
      duration: 0.5,
      id: 'legacy-scroll',
      kind: VideoProjectActionEventKind.SCROLL,
      label: 'Legacy scroll',
      point: null,
      preset: VideoProjectActionPreset.SCROLL_EMPHASIS,
      time: 0.4,
    },
    {
      data: {},
      duration: 0.6,
      id: 'click-1',
      kind: VideoProjectActionEventKind.CLICK,
      label: 'Click',
      point: { x: 100, y: 120 },
      preset: VideoProjectActionPreset.CLICK_RIPPLE,
      time: 1.2,
    },
  ];

  return project;
}

describe('video-editor visible action events', () => {
  it('filters legacy scroll events from editor-facing action lists', () => {
    expect(getVisibleProjectActionEvents(createProjectWithLegacyScroll())).toEqual([
      expect.objectContaining({
        id: 'click-1',
      }),
    ]);
  });

  it('finds only visible action events by id', () => {
    const project = createProjectWithLegacyScroll();

    expect(findVisibleProjectActionEvent(project, 'legacy-scroll')).toBeNull();
    expect(findVisibleProjectActionEvent(project, 'click-1')).toEqual(
      expect.objectContaining({
        id: 'click-1',
      })
    );
  });

  it('reports action availability from visible events only', () => {
    const project = createProjectWithLegacyScroll();

    expect(hasVisibleProjectActionEvents(project)).toBe(true);

    project.actionEvents = [project.actionEvents[0]!];
    expect(hasVisibleProjectActionEvents(project)).toBe(false);
  });
});
