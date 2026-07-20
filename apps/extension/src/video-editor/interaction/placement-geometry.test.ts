import { describe, expect, it, vi } from 'vitest';
import { VideoMotionFocusMode } from '../../features/video/project/types/index';
import {
  buildDraggedArea,
  clampStagePoint,
  createSquareArea,
  getProjectCenter,
} from './placement-geometry';
import { updateMotionArea } from './motion-area';

describe('video editor placement geometry', () => {
  it('resolves project points and clamps them to composition bounds', () => {
    const project = { height: 720, width: 1280 };

    expect(getProjectCenter(project)).toEqual({ x: 640, y: 360 });
    expect(clampStagePoint(project, { x: -8, y: 900 })).toEqual({ x: 0, y: 720 });
  });

  it('creates and drags motion focus areas', () => {
    const area = createSquareArea({ x: 120, y: 80 }, { x: 80, y: 150 });

    expect(area).toEqual({ height: 70, width: 48, x: 72, y: 80 });
    expect(buildDraggedArea(area, 6, -4, 'move')).toEqual({
      height: 70,
      width: 48,
      x: 78,
      y: 76,
    });
    expect(buildDraggedArea(area, 10, 12, 'resize')).toEqual({
      height: 82,
      width: 58,
      x: 72,
      y: 80,
    });
  });

  it('writes manual-area focus patches through the supplied mutation owner', () => {
    const onUpdateMotionRegion = vi.fn();

    updateMotionArea('motion-1', { height: 60, width: 80, x: 12, y: 16 }, onUpdateMotionRegion);

    expect(onUpdateMotionRegion).toHaveBeenCalledWith('motion-1', {
      focusArea: { height: 60, width: 80, x: 12, y: 16 },
      focusMode: VideoMotionFocusMode.MANUAL_AREA,
    });
  });
});
