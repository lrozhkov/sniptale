import { expect, it, vi } from 'vitest';
import { createFloatingWorkspaceController } from '../floating/top-panels.test-support';
import { getProjectTimelineProps } from './timeline-props';

it('carries whole Zoom lane selection through the workspace timeline composition', () => {
  const { timeline } = createFloatingWorkspaceController();
  const props = getProjectTimelineProps(timeline, vi.fn());
  expect(props.onSelectMotionLane).toBe(timeline.actions.onSelectMotionLane);
  props.onSelectMotionLane?.();
  expect(timeline.actions.onSelectMotionLane).toHaveBeenCalledOnce();
});
