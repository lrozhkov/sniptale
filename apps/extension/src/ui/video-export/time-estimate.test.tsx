// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoExportTimeHint } from './time-estimate';
import type { VideoProjectExportTimeEstimate } from '../../features/video/project/types/export';

vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  useAppLocale: () => 'en',
  translate: (key: string) => key,
}));
let host: HTMLDivElement;
let root: Root;
let monotonic = 0;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 6, 23, 59, 0));
  monotonic = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => monotonic);
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function render(
  estimate?: VideoProjectExportTimeEstimate | null,
  active = true,
  finishing = false
) {
  act(() =>
    root.render(<VideoExportTimeHint estimate={estimate} active={active} finishing={finishing} />)
  );
}
it('waits for measured work, displays a single duration and local next-day clock', () => {
  render();
  expect(host.textContent).toContain('timeEstimating');
  render({ remainingMs: 120_000 });
  expect(host.textContent).toContain('timeRemaining');
  expect(host.textContent).toContain('timeCompletion');
  expect(host.textContent).toContain('timeTomorrow');
  expect(host.textContent).not.toContain('–');
});
it('uses monotonic elapsed time while following a system clock change', () => {
  const estimate = { remainingMs: 120_000 };
  render(estimate);
  vi.setSystemTime(new Date(2026, 9, 6, 15, 0, 0));
  monotonic = 10_000;
  act(() => vi.advanceTimersByTime(1000));
  expect(host.textContent).toContain('50 videoEditor.progress.timeSecond');
  expect(host.textContent).not.toContain('timeTomorrow');
  expect(host.textContent).toContain('03:01');
});
it('hides only the completion clock when wall time is invalid', () => {
  vi.spyOn(Date, 'now').mockReturnValue(NaN);
  render({ remainingMs: 20_000 });
  expect(host.textContent).toContain('timeRemaining');
  expect(host.textContent).not.toContain('timeCompletion');
});
it('does not count down to a false completion after a stalled producer', () => {
  render({ remainingMs: 2000 });
  monotonic = 3000;
  act(() => vi.advanceTimersByTime(1000));
  expect(host.textContent).toContain('timeRefining');
  expect(host.textContent).not.toContain('timeCompletion');
  render({ remainingMs: 20_000 });
  expect(host.textContent).toContain('timeCompletion');
});
it('clears timers and old estimates for terminal or unknown finalization states', () => {
  const estimate = { remainingMs: 20_000 };
  render(estimate);
  expect(vi.getTimerCount()).toBe(1);
  render(estimate, true, true);
  expect(host.textContent).toBe('');
  expect(vi.getTimerCount()).toBe(0);
  render(estimate, false);
  expect(host.textContent).toBe('');
  render(null);
  expect(host.textContent).toContain('timeEstimating');
});
it.each([NaN, Infinity, -1, 0])('does not show invalid estimate %s', (remainingMs) => {
  render({ remainingMs });
  expect(host.textContent).not.toContain('timeCompletion');
  expect(host.textContent).not.toContain('NaN');
});

function displayedSeconds(): number {
  const text = host.querySelector('span')?.textContent ?? '';
  const minutes = Number(text.match(/(\d+) videoEditor.progress.timeMinute/)?.[1] ?? 0);
  const seconds = Number(text.match(/(\d+) videoEditor.progress.timeSecond/)?.[1] ?? 0);
  return minutes * 60 + seconds;
}
it('keeps a multi-minute forecast steady through a transient 40 second revision', () => {
  render({ remainingMs: 240_000 });
  monotonic = 1000;
  render({ remainingMs: 190_000 });
  act(() => vi.advanceTimersByTime(1000));
  expect(displayedSeconds()).toBeGreaterThanOrEqual(230);
  monotonic = 2000;
  render({ remainingMs: 230_000 });
  act(() => vi.advanceTimersByTime(1000));
  expect(displayedSeconds()).toBeGreaterThanOrEqual(230);
});

function step(remainingMs: number, updates = 1) {
  monotonic += 1000;
  for (let index = 0; index < updates; index++) render({ remainingMs });
  act(() => vi.advanceTimersByTime(1000));
  return displayedSeconds();
}
it('bounds every visible revision during two minutes of alternating noisy forecasts', () => {
  render({ remainingMs: 480_000 });
  let previous = displayedSeconds();
  for (let second = 1; second <= 120; second++) {
    const current = step(480_000 - second * 1000 + (second % 2 ? -40_000 : 40_000));
    expect(Math.abs(current - previous)).toBeLessThanOrEqual(10);
    previous = current;
  }
  expect(previous).toBeGreaterThanOrEqual(340);
  expect(previous).toBeLessThanOrEqual(380);
});
it('eventually follows a sustained slowdown without a sudden upward jump', () => {
  render({ remainingMs: 240_000 });
  let previous = displayedSeconds();
  for (let second = 1; second <= 30; second++) {
    const current = step(360_000 - second * 1000);
    expect(current - previous).toBeLessThanOrEqual(10);
    previous = current;
  }
  expect(previous).toBeGreaterThan(240);
});
it('follows sustained acceleration gradually instead of dropping forty seconds at once', () => {
  render({ remainingMs: 240_000 });
  let previous = displayedSeconds();
  for (let second = 1; second <= 30; second++) {
    const current = step(180_000 - second * 1000);
    expect(previous - current).toBeLessThanOrEqual(10);
    previous = current;
  }
  expect(previous).toBeLessThan(210);
  expect(previous).toBeGreaterThan(150);
});
it('does not give repeated renders extra votes in the median', () => {
  render({ remainingMs: 240_000 });
  const once: number[] = [];
  for (let second = 1; second <= 20; second++) once.push(step(300_000 - second * 1000));
  render(null);
  monotonic = 0;
  render({ remainingMs: 240_000 });
  const many: number[] = [];
  for (let second = 1; second <= 20; second++) many.push(step(300_000 - second * 1000, 20));
  expect(many).toEqual(once);
});
it.each(['inactive', 'finishing', 'unknown'])('starts a fresh forecast after %s', (reset) => {
  render({ remainingMs: 480_000 });
  step(600_000);
  render(
    reset === 'unknown' ? null : { remainingMs: 480_000 },
    reset !== 'inactive',
    reset === 'finishing'
  );
  render({ remainingMs: 20_000 });
  expect(displayedSeconds()).toBe(20);
});
it('hides both numbers when the monotonic clock becomes invalid', () => {
  render({ remainingMs: 120_000 });
  monotonic = NaN;
  act(() => vi.advanceTimersByTime(1000));
  expect(host.textContent).toContain('timeRefining');
  expect(host.textContent).not.toContain('timeCompletion');
});

it('converges after a sustained twofold speedup without holding minutes of stale reserve', () => {
  render({ remainingMs: 480_000 });
  let previous = displayedSeconds();
  for (let second = 1; second <= 130; second++) {
    const current = step(240_000 - second * 1000);
    expect(Math.abs(current - previous)).toBeLessThanOrEqual(10);
    previous = current;
  }
  expect(previous).toBeGreaterThanOrEqual(110);
  expect(previous).toBeLessThanOrEqual(120);
});

function completionText() {
  return host.querySelectorAll('span')[1]?.textContent ?? '';
}

it('keeps completion fixed between clock ticks despite parent progress rerenders', () => {
  vi.setSystemTime(new Date(2026, 9, 6, 15, 0, 0));
  render({ remainingMs: 179_600 });
  const initial = completionText();
  expect(initial).toContain('03:02');
  monotonic = 500;
  vi.setSystemTime(new Date(2026, 9, 6, 15, 0, 0, 500));
  render({ remainingMs: 179_100 });
  expect(completionText()).toBe(initial);
});

it('holds the completion minute through small sustained revisions on both sides of its boundary', () => {
  vi.setSystemTime(new Date(2026, 9, 6, 15, 0, 0));
  render({ remainingMs: 357_000 });
  for (let second = 1; second <= 60; second++) {
    const deadline = Math.floor((second - 1) / 15) % 2 ? 357_000 : 363_000;
    step(deadline - second * 1000);
    expect(completionText()).toContain('03:05');
  }
  for (let second = 61; second <= 90; second++) step(380_000 - second * 1000);
  expect(completionText()).toContain('03:06');
});

it('retains the later minute for a small earlier correction but accepts a meaningful one', () => {
  vi.setSystemTime(new Date(2026, 9, 6, 15, 0, 0));
  render({ remainingMs: 363_000 });
  for (let second = 1; second <= 30; second++) {
    step(357_000 - second * 1000);
    expect(completionText()).toContain('03:06');
  }
  for (let second = 31; second <= 60; second++) step(340_000 - second * 1000);
  expect(completionText()).toContain('03:05');
});

it('uses the same stable minute for the date label and releases it once that minute is past', () => {
  vi.setSystemTime(new Date(2026, 9, 6, 23, 58, 0));
  render({ remainingMs: 117_000 });
  for (let second = 1; second <= 30; second++) {
    step(123_000 - second * 1000);
    expect(completionText()).toContain('11:59');
    expect(completionText()).not.toContain('timeTomorrow');
  }
  monotonic = 120_000;
  vi.setSystemTime(new Date(2026, 9, 7, 0, 0, 0));
  act(() => vi.advanceTimersByTime(1000));
  expect(completionText()).toContain('12:00');
  expect(completionText()).not.toContain('11:59');
  expect(completionText()).not.toContain('timeTomorrow');
});
