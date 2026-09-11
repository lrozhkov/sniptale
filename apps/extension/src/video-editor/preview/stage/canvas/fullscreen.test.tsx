// @vitest-environment jsdom

import { act } from 'react';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/index')>()),
  translate: (key: string) => key,
}));

import {
  PreviewStageFullscreenTransport,
  usePreviewStageFullscreen,
  useFullscreenPreviewPan,
} from './fullscreen';

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

  (container!.querySelector('button') as HTMLButtonElement).focus();
  act(() => {
    (container!.querySelector('button') as HTMLButtonElement).click();
  });

  expect(container?.querySelector('[data-testid="state"]')?.textContent).toBe('open');

  act(() => {
    (container!.querySelectorAll('button')[1] as HTMLButtonElement).click();
  });

  expect(container?.querySelector('[data-testid="state"]')?.textContent).toBe('closed');
  expect(document.activeElement).toBe(container!.querySelector('button'));
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
  expect((buttons[0] as HTMLButtonElement).className).toContain('sniptale-glass-toolbar-button');

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

  expect(
    container?.querySelector('[title^="videoEditor.timeline.loopRangePrefix"]')
  ).not.toBeNull();
  expect(
    container
      ?.querySelector('[title^="videoEditor.timeline.loopRangePrefix"]')
      ?.getAttribute('title')
  ).toContain('0:04.500 - 0:06.750');
  expect(range.min).toBe('4.5');
  expect(range.max).toBe('6.75');
});

it('pans a zoomed fullscreen viewport with captured pointer and releases on cancellation', () => {
  function PanHarness() {
    const ref = React.useRef<HTMLDivElement>(null);
    const pan = useFullscreenPreviewPan(ref, 2, true);
    return <div ref={ref} {...pan.handlers} data-dragging={pan.dragging} />;
  }
  act(() => root?.render(<PanHarness />));
  const viewport = container!.firstElementChild as HTMLDivElement;
  viewport.setPointerCapture = vi.fn();
  viewport.hasPointerCapture = vi.fn(() => true);
  viewport.releasePointerCapture = vi.fn();
  viewport.scrollLeft = 100;
  viewport.scrollTop = 80;
  const send = (type: string, x: number, y: number) =>
    act(() => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      viewport.dispatchEvent(event);
    });
  send('pointerdown', 100, 100);
  expect(viewport.setPointerCapture).toHaveBeenCalledWith(1);
  send('pointermove', 70, 50);
  expect(viewport.scrollLeft).toBe(130);
  expect(viewport.scrollTop).toBe(130);
  expect(viewport.dataset['dragging']).toBe('true');
  send('pointercancel', 70, 50);
  expect(viewport.releasePointerCapture).toHaveBeenCalledWith(1);
  expect(viewport.dataset['dragging']).toBe('false');
  send('pointermove', 0, 0);
  expect(viewport.scrollLeft).toBe(130);
});
