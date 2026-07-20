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
  const onSeekToStart = vi.fn();
  act(() => {
    root?.render(
      <ProjectTimelinePlaybackSummary
        currentTime={12.34}
        duration={45.678}
        isPlaying={isPlaying}
        playbackRange={withRange ? { start: 4.5, end: 6.75 } : null}
        onClearPlaybackRange={onTogglePlay}
        onSeekToStart={onSeekToStart}
        onTogglePlay={onTogglePlay}
      />
    );
  });

  return { onSeekToStart, onTogglePlay };
}

it('renders playback summary metadata and toggles play state', () => {
  const { onTogglePlay } = renderPlaybackSummary(true);
  expect(container?.textContent).toContain('0:12.3 / 0:45.7');

  act(() => {
    container?.querySelector<HTMLButtonElement>('button')?.click();
  });

  expect(onTogglePlay).toHaveBeenCalledTimes(1);
});

it('seeks to the start from the playback summary control', () => {
  const { onSeekToStart } = renderPlaybackSummary(false);

  act(() => {
    container?.querySelectorAll<HTMLButtonElement>('button')[1]?.click();
  });

  expect(onSeekToStart).toHaveBeenCalledTimes(1);
});

it('renders a play label when playback is idle', () => {
  renderPlaybackSummary(false);
  expect(container?.querySelector<HTMLButtonElement>('button')?.getAttribute('aria-label')).toBe(
    'videoEditor.timeline.play'
  );
});

it('uses the shared content toolbar button chrome', () => {
  renderPlaybackSummary(false);
  const button = container?.querySelector<HTMLButtonElement>('button');
  expect(button?.dataset['ui']).toBe('shared.ui.content-toolbar-button');
  expect(button?.className).toContain('sniptale-glass-toolbar-button');
  expect(button?.className).toContain('!w-9');
});

it('renders the active loop range when playback range is selected', () => {
  renderPlaybackSummary(false, true);
  expect(container?.textContent).toContain('(0:04.5-0:06.8)');
});

it('keeps playback control slots stable when the range reset is unavailable', () => {
  renderPlaybackSummary(false, false);
  const buttonsWithoutRange = container?.querySelectorAll<HTMLButtonElement>('button');

  renderPlaybackSummary(false, true);
  const buttonsWithRange = container?.querySelectorAll<HTMLButtonElement>('button');

  expect(buttonsWithoutRange).toHaveLength(3);
  expect(buttonsWithRange).toHaveLength(3);
  expect(container?.querySelector('[data-playback-counter]')?.className).toContain('tabular-nums');
});

it('formats whole seconds and minute rollover with one decimal digit', () => {
  expect(formatPlaybackCounterTime(12)).toBe('0:12.0');
  expect(formatPlaybackCounterTime(59.96)).toBe('1:00.0');
});
