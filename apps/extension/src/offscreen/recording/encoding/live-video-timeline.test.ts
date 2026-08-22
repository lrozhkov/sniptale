import { describe, expect, it } from 'vitest';
import { LiveVideoTimeline } from './live-video-timeline';

describe('LiveVideoTimeline', () => {
  it('coalesces equal and backward source timestamps instead of emitting duplicate PTS', () => {
    const timeline = new LiveVideoTimeline(60);

    expect(timeline.accept(0)).toEqual({ kind: 'pending' });
    expect(timeline.accept(0)).toEqual({ kind: 'coalesce', replacePending: true });
    expect(timeline.accept(-0.001)).toEqual({ kind: 'coalesce', replacePending: false });
    expect(timeline.accept(1 / 30)).toEqual({
      duration: 1 / 30,
      keyFrame: true,
      kind: 'emit',
      timestamp: 0,
    });
  });

  it('preserves honest VFR duration when a 60 FPS request receives 30 FPS source frames', () => {
    const timeline = new LiveVideoTimeline(60);

    timeline.accept(0);
    expect(timeline.accept(1 / 30)).toEqual({
      duration: 1 / 30,
      keyFrame: true,
      kind: 'emit',
      timestamp: 0,
    });
    expect(timeline.accept(2 / 30)).toEqual({
      duration: 1 / 30,
      keyFrame: false,
      kind: 'emit',
      timestamp: 1 / 30,
    });
  });

  it('caps a 60 FPS source to a selected 30 FPS timeline without manufacturing frames', () => {
    const timeline = new LiveVideoTimeline(30);

    expect(timeline.accept(0)).toEqual({ kind: 'pending' });
    expect(timeline.accept(1 / 60)).toEqual({ kind: 'coalesce', replacePending: false });
    expect(timeline.accept(1 / 30)).toEqual({
      duration: 1 / 30,
      keyFrame: true,
      kind: 'emit',
      timestamp: 0,
    });
  });

  it('holds a sustained just-over-ceiling source to the selected long-run cadence', () => {
    const timeline = new LiveVideoTimeline(30);
    let emittedFrames = 0;

    for (let index = 0; index <= 310; index += 1) {
      if (timeline.accept(index / 31).kind === 'emit') emittedFrames += 1;
    }

    expect(emittedFrames).toBeLessThanOrEqual(300);
  });

  it('admits alternating microsecond-quantized timestamps at a 60 FPS ceiling', () => {
    const timeline = new LiveVideoTimeline(60);

    expect(timeline.accept(0)).toEqual({ kind: 'pending' });
    expect(timeline.accept(0.016666)).toMatchObject({ kind: 'emit', timestamp: 0 });
    expect(timeline.accept(0.033333)).toMatchObject({ kind: 'emit', timestamp: 0.016666 });
    expect(timeline.accept(0.05)).toMatchObject({ kind: 'emit', timestamp: 0.033333 });
  });

  it('marks the first fresh frame after a missed source interval as a recovery keyframe', () => {
    const timeline = new LiveVideoTimeline(60);

    timeline.accept(0);
    expect(timeline.accept(1 / 60)).toMatchObject({ keyFrame: true, timestamp: 0 });
    expect(timeline.accept(0.1)).toMatchObject({ keyFrame: false, timestamp: 1 / 60 });
    expect(timeline.accept(0.1 + 1 / 60)).toMatchObject({ keyFrame: true, timestamp: 0.1 });
  });

  it('uses the last observed interval for the terminal frame', () => {
    const timeline = new LiveVideoTimeline(60);

    timeline.accept(0);
    timeline.accept(1 / 30);
    expect(timeline.finish()).toEqual({
      duration: 1 / 30,
      keyFrame: false,
      timestamp: 1 / 30,
    });
  });

  it('does not extend the terminal frame by the preceding discontinuity', () => {
    const timeline = new LiveVideoTimeline(60);

    timeline.accept(0);
    timeline.accept(1 / 30);
    timeline.accept(1);
    expect(timeline.finish()).toEqual({
      duration: 1 / 30,
      keyFrame: true,
      timestamp: 1,
    });
  });
});
