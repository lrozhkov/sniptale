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
