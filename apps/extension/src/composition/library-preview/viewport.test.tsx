// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useLibraryFullscreen, useLibraryViewport } from './viewport';

it('hands focus to an inspector while ordinary exits still restore the fullscreen trigger', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let active: Element | null = null;
  let state!: ReturnType<typeof useLibraryFullscreen>;
  const failed = vi.fn();
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => active });
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: vi.fn(async () => {
      active = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    }),
  });
  function Fixture() {
    state = useLibraryFullscreen(failed);
    return (
      <>
        <div ref={state.frame} />
        <button ref={state.fullscreenButton}>Fullscreen</button>
        <button id="inspector-focus">Inspector</button>
      </>
    );
  }
  try {
    act(() => root.render(<Fixture />));
    const inspector = host.querySelector<HTMLButtonElement>('#inspector-focus')!;
    for (const handoff of [true, false]) {
      act(() => {
        active = host.querySelector('div');
        document.dispatchEvent(new Event('fullscreenchange'));
      });
      inspector.focus();
      await act(async () => {
        expect(await (handoff ? state.exitFullscreenForHandoff() : state.exitFullscreen())).toBe(
          true
        );
      });
      expect(document.activeElement).toBe(handoff ? inspector : state.fullscreenButton.current);
    }
    await act(async () => {
      expect(await state.exitFullscreenForHandoff()).toBe(true);
    });
    for (const failure of ['unavailable', 'incomplete', 'rejected']) {
      act(() => {
        active = host.querySelector('div');
        document.dispatchEvent(new Event('fullscreenchange'));
      });
      Object.defineProperty(document, 'exitFullscreen', {
        configurable: true,
        value:
          failure === 'unavailable'
            ? undefined
            : vi.fn(async () => {
                if (failure === 'rejected') throw new Error('Denied');
              }),
      });
      failed.mockClear();
      await act(async () => {
        expect(await state.exitFullscreenForHandoff()).toBe(false);
      });
      expect(failed).toHaveBeenCalledWith(true);
      inspector.focus();
      act(() => {
        active = null;
        document.dispatchEvent(new Event('fullscreenchange'));
      });
      expect(document.activeElement).toBe(state.fullscreenButton.current);
    }
    const frame = state.frame.current!;
    frame.requestFullscreen = vi.fn(async () => {
      active = frame;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    await act(async () => state.enterFullscreen());
    expect(state.fullscreen).toBe(true);
    frame.requestFullscreen = vi.fn(async () => {
      throw new Error('Denied entry');
    });
    failed.mockClear();
    await act(async () => state.enterFullscreen());
    expect(failed).toHaveBeenCalledWith(true);
  } finally {
    act(() => root.unmount());
    host.remove();
    Reflect.deleteProperty(document, 'fullscreenElement');
    Reflect.deleteProperty(document, 'exitFullscreen');
    vi.unstubAllGlobals();
  }
});

function viewportFixture(withImage = true, observe = true) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let measure = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    observe
      ? class {
          constructor(callback: () => void) {
            measure = callback;
          }
          observe() {}
          disconnect = disconnect;
        }
      : undefined
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let state!: ReturnType<typeof useLibraryViewport>;
  const dimensions = { width: 400, height: 300 };
  const captured = new Set<number>();
  function Fixture({ src }: { src: string }) {
    state = useLibraryViewport(src, vi.fn());
    return (
      <div
        {...state.pan.handlers}
        ref={(node) => {
          state.viewport.current = node;
          if (!node) return;
          Object.defineProperties(node, {
            clientWidth: { configurable: true, get: () => dimensions.width },
            clientHeight: { configurable: true, get: () => dimensions.height },
          });
          node.getBoundingClientRect = () =>
            new DOMRect(10, 20, dimensions.width, dimensions.height);
          node.setPointerCapture = (id) => {
            captured.add(id);
          };
          node.hasPointerCapture = (id) => captured.has(id);
          node.releasePointerCapture = (id) => {
            captured.delete(id);
          };
        }}
      >
        {withImage ? (
          <img
            alt="Preview"
            ref={(node) => {
              if (!node) return;
              Object.defineProperties(node, {
                naturalWidth: { configurable: true, value: 800 },
                naturalHeight: { configurable: true, value: 400 },
              });
              node.getBoundingClientRect = () => {
                const width = state.imageSize?.width ?? 400,
                  height = state.imageSize?.height ?? 200;
                const viewport = state.viewport.current;
                return new DOMRect(
                  10 + Math.max(0, (dimensions.width - width) / 2) - (viewport?.scrollLeft ?? 0),
                  20 + Math.max(0, (dimensions.height - height) / 2) - (viewport?.scrollTop ?? 0),
                  width,
                  height
                );
              };
            }}
            onLoad={(event) => state.onImageLoad(event.currentTarget)}
          />
        ) : null}
      </div>
    );
  }
  const render = (src: string) => act(() => root.render(<Fixture src={src} />));
  render('first');
  const node = host.firstElementChild as HTMLDivElement;
  const pointer = (type: string, id: number, x = 100, y = 100, button = 0) =>
    act(() => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button,
      });
      Object.defineProperty(event, 'pointerId', { value: id });
      node.dispatchEvent(event);
    });
  return {
    node,
    host,
    captured,
    disconnect,
    render,
    pointer,
    state: () => state,
    load: () => act(() => host.querySelector('img')?.dispatchEvent(new Event('load'))),
    resize: (width: number, height: number) =>
      act(() => {
        dimensions.width = width;
        dimensions.height = height;
        measure();
      }),
    close: () => {
      act(() => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    },
  };
}

it('fits decoded images and preserves the visible image center through zoom and resize', () => {
  const fixture = viewportFixture();
  try {
    fixture.load();
    expect(fixture.state().imageSize).toEqual({ width: 400, height: 200 });
    expect(fixture.state().fitScale).toBe(0.5);
    act(() => fixture.state().setZoom(2));
    expect(fixture.state().imageSize).toEqual({ width: 800, height: 400 });
    expect(fixture.node.scrollLeft).toBe(200);
    expect(fixture.node.scrollTop).toBe(50);
    act(() => fixture.state().setZoom(1));
    expect(fixture.node.scrollLeft).toBe(0);
    expect(fixture.node.scrollTop).toBe(0);
    fixture.resize(200, 150);
    expect(fixture.state().imageSize).toEqual({ width: 200, height: 100 });
    expect(fixture.state().fitScale).toBe(0.25);
    act(() => fixture.state().setZoom(100));
    expect(fixture.state().imageSize).toEqual({ width: 3200, height: 1600 });
    fixture.render('replacement');
    expect(fixture.state().zoom).toBe(1);
    expect(fixture.state().imageSize).toBeNull();
    expect(fixture.node.scrollLeft).toBe(0);
    expect(fixture.node.scrollTop).toBe(0);
    fixture.load();
    expect(fixture.state().imageSize).toEqual({ width: 200, height: 100 });
  } finally {
    fixture.close();
  }
  expect(fixture.disconnect).toHaveBeenCalledOnce();
});

it.each([0, 1, 2])(
  'wheel zoom keeps the pointer over the same image point for delta mode %s',
  (deltaMode) => {
    const fixture = viewportFixture();
    try {
      fixture.load();
      const wheel = (ctrlKey: boolean, deltaY: number, metaKey = false) => {
        const event = new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          ctrlKey,
          metaKey,
          deltaY,
          deltaMode,
          clientX: 110,
          clientY: 120,
        });
        act(() => fixture.node.dispatchEvent(event));
        return event;
      };
      expect(wheel(false, -1).defaultPrevented).toBe(false);
      expect(wheel(true, 0).defaultPrevented).toBe(false);
      expect(fixture.state().zoom).toBe(1);
      expect(wheel(true, -10).defaultPrevented).toBe(true);
      const rect = fixture.host.querySelector('img')!.getBoundingClientRect();
      expect((110 - rect.left) / rect.width).toBeCloseTo(0.25);
      expect((120 - rect.top) / rect.height).toBeCloseTo(0.25);
      wheel(false, 100000, true);
      expect(fixture.state().zoom).toBe(1);
    } finally {
      fixture.close();
    }
  }
);

it.each(['pointerup', 'pointercancel', 'lostpointercapture', 'zoom-out'] as const)(
  'pan captures one pointer and releases it on %s',
  (end) => {
    const fixture = viewportFixture(false);
    try {
      fixture.pointer('pointerdown', 1);
      expect(fixture.captured.size).toBe(0);
      act(() => fixture.state().setZoom(2));
      expect(fixture.node.scrollLeft).toBe(200);
      expect(fixture.node.scrollTop).toBe(150);
      fixture.pointer('pointerdown', 1, 100, 100, 2);
      expect(fixture.captured.size).toBe(0);
      fixture.pointer('pointerdown', 1);
      fixture.pointer('pointerdown', 2);
      expect([...fixture.captured]).toEqual([1]);
      expect(fixture.state().pan.dragging).toBe(true);
      fixture.pointer('pointermove', 2, 60, 70);
      expect(fixture.node.scrollLeft).toBe(200);
      fixture.pointer('pointermove', 1, 60, 70);
      expect(fixture.node.scrollLeft).toBe(240);
      expect(fixture.node.scrollTop).toBe(180);
      fixture.pointer('pointerup', 2);
      expect(fixture.state().pan.dragging).toBe(true);
      if (end === 'zoom-out') act(() => fixture.state().setZoom(1));
      else fixture.pointer(end, 1);
      expect(fixture.state().pan.dragging).toBe(false);
      expect(fixture.captured.size).toBe(0);
      fixture.pointer('pointermove', 1, 0, 0);
      fixture.render('replacement');
      expect(fixture.node.scrollLeft).toBe(0);
      expect(fixture.node.scrollTop).toBe(0);
    } finally {
      fixture.close();
    }
  }
);

it('supports measurement without ResizeObserver and ignores unloaded image dimensions', () => {
  const fixture = viewportFixture(true, false);
  try {
    const image = fixture.host.querySelector('img')!;
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 0 });
    fixture.load();
    expect(fixture.state().imageSize).toBeNull();
    expect(fixture.state().fitScale).toBe(1);
  } finally {
    fixture.close();
  }
});
