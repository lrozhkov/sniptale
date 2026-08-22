import { describe, expect, it } from 'vitest';
import { LiveVideoTimeline } from './live-video-timeline';

describe('LiveVideoTimeline', () => {
  it.each([
    ['static text delivery', [0, 0.2, 0.4, 0.9, 1.1]],
    ['blinking caret delivery', [0, 0.1, 0.2, 0.35, 0.5]],
    ['small local changes', [0, 0.02, 0.12, 0.15, 0.23]],
    ['continuous scrolling', [0, 1 / 60, 2 / 60, 3 / 60, 4 / 60]],
  ])('keeps one timeline across %s', (_label, timestamps) => {
    const timeline = new LiveVideoTimeline(60);
    const emitted = timestamps
      .map((timestamp) => timeline.accept(timestamp))
      .filter((decision) => decision.kind === 'emit');
    const terminal = timeline.finish();

    expect(emitted.filter((decision) => decision.keyFrame)).toHaveLength(1);
    expect(terminal?.keyFrame).toBe(false);
  });

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
    expect(timeline.accept(0.033333)).toMatchObject({ kind: 'emit', timestamp: 1 / 60 });
    expect(timeline.accept(0.05)).toMatchObject({ kind: 'emit', timestamp: 2 / 60 });
  });

  it('does not treat ordinary source starvation as a timeline discontinuity', () => {
    const timeline = new LiveVideoTimeline(60);

    timeline.accept(0);
    expect(timeline.accept(1 / 60)).toMatchObject({ keyFrame: true, timestamp: 0 });
    expect(timeline.accept(0.1)).toMatchObject({ keyFrame: false, timestamp: 1 / 60 });
    expect(timeline.accept(0.1 + 1 / 60)).toMatchObject({
      keyFrame: false,
      timestamp: 0.1,
    });
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

  it('does not turn a terminal frame into a keyframe after a source gap', () => {
    const timeline = new LiveVideoTimeline(60);

    timeline.accept(0);
    timeline.accept(1 / 30);
    timeline.accept(1);
    expect(timeline.finish()).toEqual({
      duration: 1 / 30,
      keyFrame: false,
      timestamp: 1,
    });
  });
});
