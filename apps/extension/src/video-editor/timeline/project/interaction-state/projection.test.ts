import { expect, it } from 'vitest';
import {
  createTimelineProjection,
  projectTimelineInterval,
  timelineScrollLeftToTime,
  timelineTimeToViewportX,
  timelineViewportXToTime,
} from './projection';

it('keeps twelve adjacent 240fps positions distinct at twelve hours, without native scroll quantization', () => {
  const times = Array.from({ length: 12 }, (_, frame) => 43200 + frame / 240);
  const views = times.map((startTime) =>
    createTimelineProjection({
      extentSeconds: 86400,
      pixelsPerSecond: 240 * 96,
      viewportWidth: 1000,
      startTime,
    })
  );
  expect(new Set(views.map((view) => view.startTime)).size).toBe(12);
  for (const view of views) {
    expect(view.scrollWidth).toBeLessThanOrEqual(30_000_000);
    expect(timelineTimeToViewportX(view, view.startTime + 1 / 240)).toBeCloseTo(96, 5);
    expect(timelineViewportXToTime(view, 96)).toBeCloseTo(view.startTime + 1 / 240, 10);
  }
});

it('clips a day-long interval to bounded CSS geometry with the original source offset', () => {
  const view = createTimelineProjection({
    extentSeconds: 86400,
    pixelsPerSecond: 23040,
    viewportWidth: 1000,
    startTime: 43200,
  });
  const interval = projectTimelineInterval(view, 0, 86400)!;
  expect(interval.width).toBeCloseTo(1240, 5);
  expect(interval.left).toBeCloseTo(-120, 5);
  expect(interval.offsetSeconds).toBeCloseTo(43200 - 120 / 23040, 10);
  expect(interval.includesStart).toBe(false);
  expect(interval.includesEnd).toBe(false);
  expect(projectTimelineInterval(view, 0, 1)).toBeNull();
});

it('keeps true frame edges and maps scrollbar extremes to the complete admitted extent', () => {
  const view = createTimelineProjection({
    extentSeconds: 86400,
    pixelsPerSecond: 23040,
    viewportWidth: 1000,
    startTime: 43200,
  });
  const interval = projectTimelineInterval(view, 43200, 43200 + 1 / 240)!;
  expect(interval.width).toBeCloseTo(96, 5);
  expect(interval.includesStart && interval.includesEnd).toBe(true);
  expect(timelineScrollLeftToTime(view, 0)).toBe(0);
  expect(timelineScrollLeftToTime(view, view.scrollWidth)).toBe(view.maxStartTime);
  const end = createTimelineProjection({ ...view, extentSeconds: 86400, startTime: 86400 });
  expect(end.endTime).toBeCloseTo(86400, 10);
});
