// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewPanelResizeHandle, useReviewPanelLayout } from './panel-layout';

function setup() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const frame = { width: 1254, height: 536 };
  let measure!: () => void;
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        measure = callback;
      }
      observe() {}
      disconnect = disconnect;
    }
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => frame.width);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => frame.height);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 500, 140)
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Harness({ enabled }: { enabled: boolean }) {
    const layout = useReviewPanelLayout(enabled);
    return (
      <div
        ref={layout.container}
        data-container
        style={{
          gridTemplateColumns: `1fr ${layout.inspectorWidth}px`,
          gridTemplateRows: `1fr ${layout.timelineHeight === null ? 'auto' : `${layout.timelineHeight}px`}`,
        }}
      >
        {enabled ? <ReviewPanelResizeHandle resize={layout.inspector} /> : null}
        <div ref={layout.timeline}>
          {enabled ? <ReviewPanelResizeHandle resize={layout.timelineResize} /> : null}
        </div>
      </div>
    );
  }
  const render = (enabled = true) => act(() => root.render(<Harness enabled={enabled} />));
  render();
  const handle = (panel: string) =>
    host.querySelector<HTMLDivElement>(`[data-review-panel-resize="${panel}"]`)!;
  const key = (panel: string, value: string) =>
    act(() =>
      handle(panel).dispatchEvent(
        new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })
      )
    );
  const pointer = (panel: string, type: string, coordinate: number) => {
    const target = handle(panel);
    if (type === 'pointerdown')
      Object.assign(target, {
        setPointerCapture: vi.fn(),
        hasPointerCapture: () => true,
        releasePointerCapture: vi.fn(),
      });
    const event = new MouseEvent(type, {
      clientX: coordinate,
      clientY: coordinate,
      button: 0,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    act(() => target.dispatchEvent(event));
  };
  return {
    host,
    frame,
    handle,
    key,
    pointer,
    render,
    measure: () => act(() => measure()),
    container: host.querySelector<HTMLDivElement>('[data-container]')!,
    cleanup: () => {
      act(() => root.unmount());
      expect(disconnect).toHaveBeenCalled();
      host.remove();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    },
  };
}

it('clamps effective sizes, restores preferred dimensions, and leaves Basic fixed', () => {
  const fixture = setup();
  try {
    fixture.key('inspector', 'End');
    expect(fixture.handle('inspector').getAttribute('aria-valuenow')).toBe('742');
    fixture.frame.width = 1920;
    fixture.measure();
    fixture.key('inspector', 'End');
    fixture.key('timeline', 'End');
    expect(fixture.container.style.gridTemplateColumns).toBe('1fr 800px');
    expect(fixture.container.style.gridTemplateRows).toBe('1fr 316px');
    fixture.frame.width = 1254;
    fixture.container.style.paddingBottom = '160px';
    fixture.measure();
    expect(fixture.container.style.gridTemplateColumns).toBe('1fr 742px');
    expect(fixture.container.style.gridTemplateRows).toBe('1fr 156px');
    fixture.frame.width = 1920;
    fixture.container.style.paddingBottom = '0px';
    fixture.measure();
    expect(fixture.container.style.gridTemplateRows).toBe('1fr 316px');
    fixture.render(false);
    expect(fixture.host.querySelectorAll('[role="separator"]')).toHaveLength(0);
    expect(fixture.container.style.gridTemplateColumns).toBe('1fr 320px');
    expect(fixture.container.style.gridTemplateRows).toBe('1fr auto');
    fixture.render();
    expect(fixture.container.style.gridTemplateColumns).toBe('1fr 800px');
    expect(fixture.container.style.gridTemplateRows).toBe('1fr 316px');
    fixture.key('timeline', 'Home');
    expect(fixture.container.style.gridTemplateRows).toBe('1fr 120px');
    fixture.key('timeline', 'Enter');
    expect(fixture.container.style.gridTemplateRows).toBe('1fr auto');
  } finally {
    fixture.cleanup();
  }
});

it('commits drag, rolls back cancellation to natural size, and contains keyboard transport keys', () => {
  const fixture = setup();
  const keys = vi.fn();
  window.addEventListener('keydown', keys);
  try {
    fixture.pointer('timeline', 'pointerdown', 400);
    fixture.pointer('timeline', 'pointermove', 350);
    expect(fixture.container.style.gridTemplateRows).toBe('1fr 190px');
    fixture.key('timeline', 'Escape');
    expect(fixture.container.style.gridTemplateRows).toBe('1fr auto');
    fixture.pointer('inspector', 'pointerdown', 900);
    fixture.pointer('inspector', 'pointermove', 700);
    fixture.pointer('inspector', 'pointerup', 700);
    expect(fixture.container.style.gridTemplateColumns).toBe('1fr 530px');
    fixture.pointer('inspector', 'pointerdown', 700);
    fixture.pointer('inspector', 'pointermove', 650);
    act(() => window.dispatchEvent(new Event('blur')));
    expect(fixture.container.style.gridTemplateColumns).toBe('1fr 530px');
    fixture.key('inspector', 'ArrowLeft');
    expect(fixture.container.style.gridTemplateColumns).toBe('1fr 554px');
    fixture.key('inspector', 'ArrowRight');
    fixture.key('inspector', ' ');
    expect(keys).not.toHaveBeenCalled();
    fixture.pointer('timeline', 'pointerdown', 400);
    fixture.pointer('timeline', 'pointermove', 350);
    fixture.render(false);
    fixture.render();
    expect(fixture.container.style.gridTemplateRows).toBe('1fr auto');
    act(() =>
      fixture.handle('inspector').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    );
    expect(fixture.container.style.gridTemplateColumns).toBe('1fr 330px');
  } finally {
    window.removeEventListener('keydown', keys);
    fixture.cleanup();
  }
});

it.each(['pointercancel', 'lostpointercapture'])(
  'restores the pre-drag inspector width after %s',
  (event) => {
    const fixture = setup();
    try {
      fixture.key('inspector', 'ArrowLeft');
      fixture.pointer('inspector', 'pointerdown', 900);
      fixture.pointer('inspector', 'pointermove', 700);
      expect(fixture.container.style.gridTemplateColumns).toBe('1fr 554px');
      fixture.pointer('inspector', event, 700);
      expect(fixture.container.style.gridTemplateColumns).toBe('1fr 354px');
      fixture.pointer('inspector', 'pointermove', 600);
      expect(fixture.container.style.gridTemplateColumns).toBe('1fr 354px');
    } finally {
      fixture.cleanup();
    }
  }
);
