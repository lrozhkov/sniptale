// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { useRecordingCaptureVisibility } from './recording-capture-visibility';

type VisibilityParams = Omit<Parameters<typeof useRecordingCaptureVisibility>[0], 'toolbarRef'>;
const cropRegion = { x: 100, y: 100, width: 200, height: 200 };
const defaults: VisibilityParams = {
  active: true,
  captureMode: CaptureMode.TAB_CROP,
  cropRegion,
  positionReady: true,
};

function CaptureVisibilityProbe(props: VisibilityParams) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const outside = useRecordingCaptureVisibility({ ...props, toolbarRef });
  return <div ref={toolbarRef} data-outside={String(outside)} />;
}

let container: HTMLDivElement;
let root: Root;
let bounds: DOMRect;
let deliverResize = () => {};
const disconnect = vi.fn();
const observe = vi.fn();

function render(overrides: Partial<VisibilityParams> = {}) {
  act(() => root.render(<CaptureVisibilityProbe {...defaults} {...overrides} />));
}
function outside() {
  return container.firstElementChild?.getAttribute('data-outside') === 'true';
}

beforeEach(() => {
  bounds = new DOMRect(0, 0, 50, 50);
  container = document.createElement('div');
  root = createRoot(container);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => bounds);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        deliverResize = () => callback([], this);
      }
      observe = observe;
      unobserve() {}
      disconnect = disconnect;
    }
  );
});
afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  observe.mockClear();
  disconnect.mockClear();
});

describe('recording capture visibility', () => {
  it.each([
    { edge: 'left', x: 20, y: 150, width: 80, height: 40 },
    { edge: 'right', x: 300, y: 150, width: 80, height: 40 },
    { edge: 'above', x: 150, y: 20, width: 40, height: 80 },
    { edge: 'below', x: 150, y: 300, width: 40, height: 80 },
    { edge: 'corner', x: 0, y: 0, width: 50, height: 50 },
  ])(
    'recognizes a shell wholly outside at the $edge edge, including exact contact',
    ({ x, y, width, height }) => {
      bounds = new DOMRect(x, y, width, height);
      render();
      expect(outside()).toBe(true);
    }
  );

  it.each([
    [99.75, 150, 80, 40],
    [220.25, 150, 80, 40],
    [150, 99.75, 40, 80],
    [150, 220.25, 40, 80],
    [110, 110, 40, 40],
    [50, 50, 300, 300],
  ])('retains fade for any positive overlap, client bounds=%s/%s/%s/%s', (x, y, width, height) => {
    bounds = new DOMRect(x, y, width, height);
    render();
    expect(outside()).toBe(false);
  });

  it.each([
    { captureMode: CaptureMode.TAB },
    { captureMode: null },
    { cropRegion: null },
    { active: false },
    { positionReady: false },
    { cropRegion: { ...cropRegion, width: 0 } },
    { cropRegion: { ...cropRegion, height: -1 } },
    { cropRegion: { ...cropRegion, x: -1 } },
    { cropRegion: { ...cropRegion, y: NaN } },
    { cropRegion: { ...cropRegion, width: Infinity } },
  ])(
    'does not prove outside capture for unavailable or invalid recording geometry: %j',
    (override) => {
      render(override);
      expect(outside()).toBe(false);
    }
  );

  it.each([
    new DOMRect(0, 0, 0, 20),
    new DOMRect(0, 0, 20, 0),
    new DOMRect(NaN, 0, 20, 20),
    new DOMRect(0, 0, Infinity, 20),
  ])('retains conservative fading for an unusable measured shell: %j', (invalid) => {
    bounds = invalid;
    render();
    expect(outside()).toBe(false);
  });

  it('rechecks committed repositioning, actual scaled bounds, and crop replacement', () => {
    render();
    expect(outside()).toBe(true);
    // A UI-scale or position update can cross the crop without changing logical shell dimensions.
    bounds = new DOMRect(50, 80, 160, 40);
    render();
    expect(outside()).toBe(false);
    bounds = new DOMRect(500, 80, 160, 40);
    render();
    expect(outside()).toBe(true);
    render({ cropRegion: { x: 480, y: 50, width: 200, height: 200 } });
    expect(outside()).toBe(false);
  });

  it('rechecks size changes through ResizeObserver and viewport resize, then removes observers', () => {
    bounds = new DOMRect(0, 150, 80, 40);
    render();
    expect(observe).toHaveBeenCalledWith(container.firstElementChild);
    expect(outside()).toBe(true);
    bounds = new DOMRect(0, 150, 120, 40);
    act(() => deliverResize());
    expect(outside()).toBe(false);
    bounds = new DOMRect(0, 150, 80, 40);
    act(() => window.dispatchEvent(new Event('resize')));
    expect(outside()).toBe(true);
    render({ active: false });
    expect(disconnect).toHaveBeenCalledOnce();
    expect(outside()).toBe(false);
  });

  it('still rechecks placement and window resize when ResizeObserver is unavailable', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    render();
    expect(outside()).toBe(true);
    bounds = new DOMRect(150, 150, 80, 40);
    act(() => window.dispatchEvent(new Event('resize')));
    expect(outside()).toBe(false);
  });
});
