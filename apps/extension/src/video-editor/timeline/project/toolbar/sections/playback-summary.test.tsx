// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { formatPlaybackCounterTime, ProjectTimelinePlaybackSummary } from './playback-summary';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function renderPlaybackSummary(isPlaying: boolean, withRange = false) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const onTogglePlay = vi.fn();
  const onSeekToEnd = vi.fn();
  const onSeekToStart = vi.fn();
  const onStepToNextFrame = vi.fn();
  const onStepToPreviousFrame = vi.fn();
  act(() => {
    root?.render(
      <ProjectTimelinePlaybackSummary
        currentTime={12.34}
        duration={45.678}
        isPlaying={isPlaying}
        playbackRange={withRange ? { start: 4.5, end: 6.75 } : null}
        onSeekToEnd={onSeekToEnd}
        onSeekToStart={onSeekToStart}
        onStepToNextFrame={onStepToNextFrame}
        onStepToPreviousFrame={onStepToPreviousFrame}
        onTogglePlay={onTogglePlay}
      />
    );
  });

  return {
    onSeekToEnd,
    onSeekToStart,
    onStepToNextFrame,
    onStepToPreviousFrame,
    onTogglePlay,
  };
}

it('renders playback summary metadata and toggles play state', () => {
  const { onTogglePlay } = renderPlaybackSummary(true);
  expect(container?.textContent).toContain('0:12.340 / 0:45.678');
  const pauseButton = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('button') ?? []
  ).find((button) => button.getAttribute('aria-label') === 'videoEditor.timeline.pause');

  act(() => {
    pauseButton?.click();
  });

  expect(onTogglePlay).toHaveBeenCalledTimes(1);
});

it('seeks to the start from the playback summary control', () => {
  const { onSeekToStart } = renderPlaybackSummary(false);
  const startButton = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('button') ?? []
  ).find((button) => button.getAttribute('aria-label') === 'videoEditor.timeline.seekToStart');

  act(() => {
    startButton?.click();
  });

  expect(startButton).toBeDefined();
  expect(onSeekToStart).toHaveBeenCalledTimes(1);
});

it('seeks to the end from the symmetric playback summary control', () => {
  const { onSeekToEnd } = renderPlaybackSummary(false);
  const endButton = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (button) => button.getAttribute('aria-label') === 'videoEditor.timeline.seekToEnd'
  );

  act(() => endButton?.click());

  expect(endButton).toBeDefined();
  expect(onSeekToEnd).toHaveBeenCalledTimes(1);
});

it('steps to the previous and next project frames from the transport', () => {
  const { onStepToNextFrame, onStepToPreviousFrame } = renderPlaybackSummary(false);
  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const previousButton = buttons.find(
    (button) => button.getAttribute('aria-label') === 'videoEditor.timeline.previousFrame'
  );
  const nextButton = buttons.find(
    (button) => button.getAttribute('aria-label') === 'videoEditor.timeline.nextFrame'
  );

  act(() => {
    previousButton?.click();
    nextButton?.click();
  });

  expect(previousButton).toBeDefined();
  expect(nextButton).toBeDefined();
  expect(onStepToPreviousFrame).toHaveBeenCalledTimes(1);
  expect(onStepToNextFrame).toHaveBeenCalledTimes(1);
});

it('renders a play label when playback is idle', () => {
  renderPlaybackSummary(false);
  expect(
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).some(
      (button) => button.getAttribute('aria-label') === 'videoEditor.timeline.play'
    )
  ).toBe(true);
});

it('uses the shared content toolbar button chrome', () => {
  renderPlaybackSummary(false);
  const button = container?.querySelector<HTMLButtonElement>('button');
  expect(button?.dataset['ui']).toBe('shared.ui.content-toolbar-button');
  expect(button?.className).toContain('sniptale-glass-toolbar-button');
  expect(button?.className).toContain('!w-6');
});

it('renders the active loop range when playback range is selected', () => {
  renderPlaybackSummary(false, true);
  expect(container?.textContent).toContain('(0:04.500-0:06.750)');
});

it('keeps five playback controls with or without a range, without a reset button', () => {
  renderPlaybackSummary(false, false);
  const buttonsWithoutRange = container?.querySelectorAll<HTMLButtonElement>('button');

  renderPlaybackSummary(false, true);
  const buttonsWithRange = container?.querySelectorAll<HTMLButtonElement>('button');

  expect(buttonsWithoutRange).toHaveLength(5);
  expect(buttonsWithRange).toHaveLength(5);
  expect(container?.querySelector('[data-playback-counter]')?.className).toContain('tabular-nums');
});

it('formats elapsed milliseconds without rounding into a later second', () => {
  expect(formatPlaybackCounterTime(12)).toBe('0:12.000');
  expect(formatPlaybackCounterTime(59.96)).toBe('0:59.960');
});

it('keeps short frames nonzero and long project time readable', () => {
  expect(formatPlaybackCounterTime(1 / 30)).toBe('0:00.033');
  expect(formatPlaybackCounterTime(1 / 60)).toBe('0:00.017');
  expect(formatPlaybackCounterTime(1 / 240)).toBe('0:00.004');
  expect(formatPlaybackCounterTime(43200 + 1 / 240)).toBe('12:00:00.004');
  expect(formatPlaybackCounterTime(3599.9996)).toBe('1:00:00.000');
});
