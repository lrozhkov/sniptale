// @vitest-environment jsdom

import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPreviewNavigatorGeometry,
  PreviewStageZoomNavigator,
  resolvePreviewNavigatorScrollTarget,
} from './navigator';

const { cleanupPointerSession, startPointerSession } = vi.hoisted(() => ({
  cleanupPointerSession: vi.fn(),
  startPointerSession: vi.fn(() => cleanupPointerSession),
}));

vi.mock('../../../interaction/pointer-session', () => ({
  startWindowPointerSession: startPointerSession,
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

describe('preview stage zoom navigator', () => {
  it('stays absent without overflow and maps both overflow axes into the overview', () => {
    expect(
      createPreviewNavigatorGeometry({
        clientHeight: 400,
        clientWidth: 600,
        scrollHeight: 400,
        scrollLeft: 0,
        scrollTop: 0,
        scrollWidth: 600,
      })
    ).toBeNull();

    expect(
      createPreviewNavigatorGeometry({
        clientHeight: 360,
        clientWidth: 640,
        scrollHeight: 1080,
        scrollLeft: 320,
        scrollTop: 180,
        scrollWidth: 1920,
      })
    ).toEqual({
      height: 81,
      viewportHeight: 27,
      viewportLeft: 24,
      viewportTop: 13.5,
      viewportWidth: 48,
      width: 144,
    });
  });

  it('clamps click navigation to the scrollable extents', () => {
    const metrics = {
      clientHeight: 300,
      clientWidth: 500,
      scrollHeight: 900,
      scrollLeft: 0,
      scrollTop: 0,
      scrollWidth: 1500,
    };

    expect(
      resolvePreviewNavigatorScrollTarget({
        clientX: 144,
        clientY: 90,
        metrics,
        navigatorRect: { height: 90, left: 0, top: 0, width: 144 },
      })
    ).toEqual({ left: 1000, top: 600 });
  });

  it('updates completed frames without repainting idle or scrolled thumbnails', () => {
    vi.useFakeTimers();
    const drawImage = vi.fn();
    const context = { clearRect: vi.fn(), drawImage };
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const viewport = document.createElement('div');
    const content = document.createElement('div');
    const source = document.createElement('canvas');
    source.setAttribute('data-preview-stage-canvas', '');
    content.append(source);
    Object.defineProperties(viewport, {
      clientHeight: { value: 300 },
      clientWidth: { value: 500 },
      scrollHeight: { configurable: true, value: 900 },
      scrollWidth: { value: 1500 },
    });
    try {
      act(() =>
        root?.render(
          <PreviewStageZoomNavigator
            contentRef={{ current: content }}
            viewportRef={{ current: viewport }}
          />
        )
      );
      expect(drawImage).toHaveBeenCalledOnce();
      act(() => vi.advanceTimersByTime(1000));
      expect(drawImage).toHaveBeenCalledOnce();
      act(() => viewport.dispatchEvent(new Event('scroll')));
      expect(drawImage).toHaveBeenCalledOnce();
      act(() => source.dispatchEvent(new Event('sniptale-preview-frame', { bubbles: true })));
      expect(drawImage).toHaveBeenCalledOnce();
      act(() => {
        source.dispatchEvent(new Event('sniptale-preview-frame', { bubbles: true }));
        vi.advanceTimersByTime(250);
      });
      expect(drawImage).toHaveBeenCalledTimes(2);
      Object.defineProperty(viewport, 'scrollHeight', { value: 1800 });
      act(() => window.dispatchEvent(new Event('resize')));
      expect(drawImage).toHaveBeenCalledTimes(3);
      act(() => source.dispatchEvent(new Event('sniptale-preview-frame', { bubbles: true })));
      act(() => root?.unmount());
      root = null;
      act(() => vi.advanceTimersByTime(1000));
      source.dispatchEvent(new Event('sniptale-preview-frame', { bubbles: true }));
      expect(drawImage).toHaveBeenCalledTimes(3);
    } finally {
      getContext.mockRestore();
      vi.useRealTimers();
    }
  });

  it('starts drag navigation and releases the window pointer session on unmount', () => {
    const viewport = document.createElement('div');
    const content = document.createElement('div');
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 300 },
      clientWidth: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 900 },
      scrollWidth: { configurable: true, value: 1500 },
    });
    viewport.scrollTo = vi.fn();
    const viewportRef = createRef<HTMLDivElement>();
    const contentRef = createRef<HTMLDivElement>();
    viewportRef.current = viewport;
    contentRef.current = content;

    act(() => {
      root?.render(<PreviewStageZoomNavigator contentRef={contentRef} viewportRef={viewportRef} />);
    });
    const navigator = container?.querySelector<HTMLButtonElement>(
      '[data-ui="video.preview.navigator"]'
    );
    expect(navigator).not.toBeNull();
    expect(navigator?.querySelector('[data-ui="video.preview.navigator.overview"]')).not.toBeNull();

    act(() => {
      navigator?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 72, clientY: 45 })
      );
    });
    expect(startPointerSession).toHaveBeenCalledTimes(1);

    act(() => root?.unmount());
    root = null;
    expect(cleanupPointerSession).toHaveBeenCalledTimes(1);
  });
});
