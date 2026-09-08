import { describe, expect, it } from 'vitest';
import { createEmptyVideoProject } from '../factories/creation';
import { createVideoProjectMotionRegion } from './index';
import { constrainMotionTiming, getMotionInsertionRange } from './placement';

function fixture() {
  const project = createEmptyVideoProject('Placement');
  project.duration = 12;
  const first = { ...createVideoProjectMotionRegion(project, 2), duration: 2 };
  const second = { ...createVideoProjectMotionRegion(project, 7), duration: 2 };
  project.motionRegions = [first, second];
  return { project, first, second };
}

describe('zoom placement', () => {
  it('uses half-open occupied intervals and fits insertion to the next neighbour', () => {
    const { project } = fixture();
    expect(getMotionInsertionRange(project, 2)).toBeNull();
    expect(getMotionInsertionRange(project, 3)).toBeNull();
    expect(getMotionInsertionRange(project, 4)).toEqual({ startTime: 4, duration: 3 });
    expect(getMotionInsertionRange(project, 12)).toBeNull();
  });

  it('reserves the whole framing connection', () => {
    const { project, first, second } = fixture();
    second.incomingConnection = { fromRegionId: first.id, easing: first.easing };
    expect(getMotionInsertionRange(project, 4)).toBeNull();
    expect(getMotionInsertionRange(project, 6)).toBeNull();
    expect(getMotionInsertionRange(project, 9)).toEqual({ startTime: 9, duration: 3 });
  });

  it('stops movement at neighbours even when the pointer jumps beyond them', () => {
    const { project, first, second } = fixture();
    expect(constrainMotionTiming(project, first, { startTime: 10, duration: 2 }, true)).toEqual({
      startTime: 5,
      duration: 2,
    });
    expect(constrainMotionTiming(project, second, { startTime: 0, duration: 2 }, true)).toEqual({
      startTime: 4,
      duration: 2,
    });
  });

  it('clamps both resize edges without consuming a neighbouring zoom', () => {
    const { project, first, second } = fixture();
    expect(constrainMotionTiming(project, first, { startTime: 2, duration: 10 }, false)).toEqual({
      startTime: 2,
      duration: 5,
    });
    expect(constrainMotionTiming(project, second, { startTime: 0, duration: 9 }, false)).toEqual({
      startTime: 4,
      duration: 5,
    });
  });

  it('lets a connected zoom move within its own connection', () => {
    const { project, first, second } = fixture();
    second.incomingConnection = { fromRegionId: first.id, easing: first.easing };
    expect(constrainMotionTiming(project, second, { startTime: 5, duration: 2 }, true)).toEqual({
      startTime: 5,
      duration: 2,
    });
  });
});
