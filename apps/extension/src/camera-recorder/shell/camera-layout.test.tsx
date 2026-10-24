// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CameraPreviewLayout } from './camera-layout';

let root: Root;
let host: HTMLDivElement;
let available: number;
let notify: () => void;
let disconnect: ReturnType<typeof vi.fn>;
const capture = vi.fn();
const release = vi.fn();

function Harness({ enabled = true }: { enabled?: boolean }) {
  return (
    <section data-test-host="" style={{ padding: 12 }}>
      <CameraPreviewLayout
        enabled={enabled}
        label="Resize camera preview"
        resetLabel="Reset camera size"
      >
        <video />
      </CameraPreviewLayout>
      <div style={{ flexGrow: 1 }}>Script and reading controls</div>
      <div data-fixed="">Fixed footer</div>
    </section>
  );
}
function handle() {
  const element = host.querySelector('[role="separator"]');
  if (!(element instanceof HTMLElement)) throw new Error('Missing camera separator');
  return element;
}
function size() {
  return Number(handle().getAttribute('aria-valuenow'));
}
function pointer(target: EventTarget, type: string, y: number, pointerId = 1) {
  const event = new MouseEvent(type, { bubbles: true, clientY: y, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  act(() => target.dispatchEvent(event));
}
function key(value: string, shiftKey = false) {
  act(() =>
    handle().dispatchEvent(new KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true }))
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  available = 800;
  disconnect = vi.fn();
  capture.mockClear();
  release.mockClear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        notify = callback;
      }
      observe = vi.fn();
      disconnect = disconnect;
    }
  );
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
    this: HTMLElement
  ) {
    return this.hasAttribute('data-test-host') ? available : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    return new DOMRect(0, 0, 400, this.hasAttribute('data-fixed') ? 32 : 0);
  });
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value: capture },
    hasPointerCapture: { configurable: true, value: () => true },
    releasePointerCapture: { configurable: true, value: release },
  });
  host = document.createElement('div');
  host.setAttribute('data-recording-surface', '');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture');
  Reflect.deleteProperty(HTMLElement.prototype, 'hasPointerCapture');
  Reflect.deleteProperty(HTMLElement.prototype, 'releasePointerCapture');
});

it('provides pointer capture, previews a drag and commits only its matching release', () => {
  const initial = size();
  pointer(handle(), 'pointerdown', 100);
  expect(capture).toHaveBeenCalledWith(1);
  pointer(window, 'pointermove', 132, 2);
  expect(size()).toBe(initial);
  pointer(window, 'pointermove', 132);
  expect(size()).toBe(initial + 32);
  pointer(window, 'pointerup', 132);
  expect(release).toHaveBeenCalledWith(1);
  pointer(window, 'pointermove', 300);
  expect(size()).toBe(initial + 32);
});

it.each(['pointercancel', 'lostpointercapture', 'blur', 'pagehide', 'Escape'])(
  'restores the accepted camera size after %s',
  (reason) => {
    key('ArrowDown');
    const accepted = size();
    pointer(handle(), 'pointerdown', 100);
    pointer(window, 'pointermove', 180);
    expect(size()).toBe(accepted + 80);
    if (reason === 'Escape') key('Escape');
    else if (reason === 'lostpointercapture') act(() => handle().dispatchEvent(new Event(reason)));
    else if (reason === 'pointercancel') pointer(window, reason, 180);
    else act(() => window.dispatchEvent(new Event(reason)));
    expect(size()).toBe(accepted);
    pointer(window, 'pointermove', 300);
    expect(size()).toBe(accepted);
  }
);

it('supports keyboard increments, limits and double-click restoration to automatic size', () => {
  expect(handle().getAttribute('aria-orientation')).toBe('horizontal');
  expect(handle().getAttribute('aria-label')).toBe('Resize camera preview');
  expect(handle().title).toBe('Reset camera size');
  const automatic = size();
  key('ArrowDown');
  expect(size()).toBe(automatic + 8);
  key('ArrowUp', true);
  expect(size()).toBe(automatic - 24);
  key('Home');
  expect(size()).toBe(56);
  key('End');
  expect(size()).toBe(556);
  expect(handle().getAttribute('aria-valuetext')).toBe('556px');
  act(() => handle().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  expect(size()).toBe(automatic);
});

it('restores automatic sizing with Enter and follows the next available height', () => {
  const automatic = size();
  key('ArrowDown');
  expect(size()).toBe(automatic + 8);
  key('Enter');
  expect(size()).toBe(automatic);
  available = 1200;
  act(() => notify());
  expect(size()).toBe(160);
});

it('reserves the script budget and restores a requested height after a short window expands', () => {
  key('End');
  expect(size()).toBe(556);
  available = 400;
  act(() => notify());
  expect(size()).toBe(156);
  expect(handle().getAttribute('aria-valuemax')).toBe('156');
  available = 800;
  act(() => window.dispatchEvent(new Event('resize')));
  expect(size()).toBe(556);
  available = 180;
  act(() => notify());
  expect(size()).toBe(56);
  available = 90;
  act(() => notify());
  expect(size()).toBe(26);
});

it('uses full flexible camera space without a separator when reading is disabled', () => {
  pointer(handle(), 'pointerdown', 100);
  pointer(window, 'pointermove', 140);
  act(() => root.render(<Harness enabled={false} />));
  expect(host.querySelector('[role="separator"]')).toBeNull();
  const preview = host.querySelector<HTMLElement>('[data-ui="camera-recorder.preview-layout"]');
  expect(preview?.style.height).toBe('');
  expect(preview?.classList.contains('flex-1')).toBe(true);
  expect(host.querySelectorAll('video')).toHaveLength(1);
  act(() => root.render(<Harness />));
  expect(size()).toBe(147);
});

it('releases capture, measurement and owner-window gesture listeners after unmount', () => {
  const remove = vi.spyOn(window, 'removeEventListener');
  pointer(handle(), 'pointerdown', 100);
  act(() => root.render(null));
  expect(disconnect).toHaveBeenCalled();
  expect(release).toHaveBeenCalledWith(1);
  for (const type of [
    'resize',
    'pointermove',
    'pointerup',
    'pointercancel',
    'keydown',
    'blur',
    'pagehide',
  ]) {
    expect(remove).toHaveBeenCalledWith(type, expect.any(Function));
  }
});

it('binds resize gestures to the adopted document window rather than the original window', () => {
  const other = document.createElement('iframe');
  document.body.append(other);
  const owner = other.contentWindow;
  const ownerDocument = other.contentDocument;
  if (!owner || !ownerDocument) throw new Error('Missing secondary document');
  key('End');
  pointer(handle(), 'pointerdown', 100);
  pointer(window, 'pointermove', 60);
  expect(size()).toBe(516);
  ownerDocument.body.append(host);
  act(() => host.dispatchEvent(new Event('sniptale-recording-surface-change')));
  expect(size()).toBe(556);
  available = 400;
  act(() => owner.dispatchEvent(new Event('resize')));
  expect(size()).toBe(156);
  available = 800;
  act(() => window.dispatchEvent(new Event('resize')));
  expect(size()).toBe(156);
  act(() => owner.dispatchEvent(new Event('resize')));
  expect(size()).toBe(556);
  const initial = size();
  pointer(handle(), 'pointerdown', 100);
  pointer(window, 'pointermove', 60);
  expect(size()).toBe(initial);
  pointer(owner, 'pointermove', 60);
  expect(size()).toBe(initial - 40);
  pointer(owner, 'pointerup', 60);
  document.body.append(host);
  other.remove();
});
