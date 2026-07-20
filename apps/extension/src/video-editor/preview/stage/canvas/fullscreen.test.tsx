// @vitest-environment jsdom

import { act } from 'react';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/index')>()),
  translate: (key: string) => key,
}));

import { PreviewStageFullscreenTransport, usePreviewStageFullscreen } from './fullscreen';

function FullscreenHookHarness() {
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const { closeFullscreen, isFullscreen, openFullscreen } = usePreviewStageFullscreen(frameRef);

  return (
    <div>
      <div ref={frameRef} data-testid="frame" />
      <button type="button" onClick={openFullscreen}>
        open
      </button>
      <button type="button" onClick={closeFullscreen}>
        close
      </button>
      <span data-testid="state">{isFullscreen ? 'open' : 'closed'}</span>
    </div>
  );
}

function TransportHarness(props: {
  onClose: () => void;
  playbackRange?: { end: number; start: number } | null;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
}) {
  return (
    <PreviewStageFullscreenTransport
      currentTime={3.25}
      duration={12}
      isPlaying={false}
      playbackRange={props.playbackRange ?? null}
      onClose={props.onClose}
      onSeek={props.onSeek}
      onTogglePlay={props.onTogglePlay}
    />
  );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    value: null,
    writable: true,
  });
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: vi.fn(() => {
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        value: null,
        writable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    }),
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('tracks DOM fullscreen open and close around the stage frame owner', () => {
  act(() => {
    root?.render(<FullscreenHookHarness />);
  });

  const frame = container?.querySelector('[data-testid="frame"]') as HTMLDivElement;
  Object.defineProperty(frame, 'requestFullscreen', {
    configurable: true,
    value: vi.fn(() => {
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        value: frame,
        writable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    }),
  });

  act(() => {
    (container?.querySelector('button') as HTMLButtonElement).click();
  });

  expect(container?.querySelector('[data-testid="state"]')?.textContent).toBe('open');

  act(() => {
    (container?.querySelectorAll('button')[1] as HTMLButtonElement).click();
  });

  expect(container?.querySelector('[data-testid="state"]')?.textContent).toBe('closed');
});

it('routes play seek and close actions through the fullscreen transport controls', () => {
  const onClose = vi.fn();
  const onSeek = vi.fn();
  const onTogglePlay = vi.fn();

  act(() => {
    root?.render(
      <TransportHarness onClose={onClose} onSeek={onSeek} onTogglePlay={onTogglePlay} />
    );
  });

  const buttons = container?.querySelectorAll('button') ?? [];
  const range = container?.querySelector('input[type="range"]') as HTMLInputElement;
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  expect(buttons.length).toBe(2);
  expect(
    container?.querySelector('[data-ui="video-editor.preview.fullscreen-transport"]')
  ).not.toBeNull();
  expect(
    container?.querySelectorAll('[data-ui="video-editor.preview.fullscreen-transport-action"]')
  ).toHaveLength(2);
  expect(range.getAttribute('data-ui')).toBe('video-editor.preview.fullscreen-seek');
  expect(range.className).toContain('sniptale-range');
  expect((buttons[0] as HTMLButtonElement).className).toContain('inline-flex h-10 min-h-10');

  act(() => {
    (buttons[0] as HTMLButtonElement).click();
    valueSetter?.call(range, '7.5');
    range.dispatchEvent(new Event('change', { bubbles: true }));
    (buttons[1] as HTMLButtonElement).click();
  });

  expect(onTogglePlay).toHaveBeenCalledOnce();
  expect(onSeek).toHaveBeenCalledWith(7.5);
  expect(onClose).toHaveBeenCalledOnce();
});

it('shows the active loop range and constrains seek bounds in fullscreen transport', () => {
  act(() => {
    root?.render(
      <TransportHarness
        onClose={vi.fn()}
        onSeek={vi.fn()}
        onTogglePlay={vi.fn()}
        playbackRange={{ start: 4.5, end: 6.75 }}
      />
    );
  });

  const range = container?.querySelector('input[type="range"]') as HTMLInputElement;

  expect(container?.textContent).toContain('videoEditor.timeline.loopRangePrefix');
  expect(container?.textContent).toContain('0:04.500 - 0:06.750');
  expect(range.min).toBe('4.5');
  expect(range.max).toBe('6.75');
});
