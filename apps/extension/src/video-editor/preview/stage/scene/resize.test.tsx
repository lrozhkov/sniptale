// @vitest-environment jsdom

import { act } from 'react';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePreviewStageCanvasResizeVersion } from './resize';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let originalDivClientHeightDescriptor: PropertyDescriptor | undefined;
let originalDivClientWidthDescriptor: PropertyDescriptor | undefined;
let stageHeight = 180;
let stageWidth = 320;
const resizeObserverState: {
  callback: ResizeObserverCallback | null;
  observedElement: HTMLDivElement | null;
} = {
  callback: null,
  observedElement: null,
};

class ResizeObserverMock {
  constructor(callback: ResizeObserverCallback) {
    resizeObserverState.callback = callback;
  }

  disconnect() {
    return undefined;
  }

  observe(element: Element) {
    resizeObserverState.observedElement = element as HTMLDivElement;
  }
}

function ResizeHarness(props: { onVersion: (version: number) => void; size: StageSize }) {
  const { onVersion, size } = props;
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const resizeVersion = usePreviewStageCanvasResizeVersion(stageRef);

  React.useEffect(() => {
    onVersion(resizeVersion);
  }, [onVersion, resizeVersion]);

  return <div ref={stageRef} style={{ height: size.height, width: size.width }} />;
}

interface StageSize {
  height: number;
  width: number;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  resetResizeObserverState();
  installDivDimensions();
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  resetResizeObserverState();
  container?.remove();
  container = null;
  restoreDescriptor(HTMLDivElement.prototype, 'clientHeight', originalDivClientHeightDescriptor);
  restoreDescriptor(HTMLDivElement.prototype, 'clientWidth', originalDivClientWidthDescriptor);
  stageHeight = 180;
  stageWidth = 320;
  vi.unstubAllGlobals();
});

it('ignores repeated resize observer notifications while stage size is unchanged', () => {
  const versions: number[] = [];
  const recordVersion = (version: number) => versions.push(version);

  renderHarness({ height: 180, width: 320 }, recordVersion);
  triggerResizeObserver();
  triggerResizeObserver();

  expect(versions).toEqual([0]);

  renderHarness({ height: 200, width: 320 }, recordVersion);
  triggerResizeObserver();

  expect(versions).toEqual([0, 1]);
});

it('bumps once when fullscreen changes the measured stage size', () => {
  const versions: number[] = [];
  const recordVersion = (version: number) => versions.push(version);

  renderHarness({ height: 180, width: 320 }, recordVersion);

  act(() => {
    stageHeight = 240;
    stageWidth = 360;
    document.dispatchEvent(new Event('fullscreenchange'));
  });

  expect(versions).toEqual([0, 1]);
});

function renderHarness(size: StageSize, onVersion: (version: number) => void) {
  stageHeight = size.height;
  stageWidth = size.width;
  act(() => {
    root?.render(<ResizeHarness onVersion={onVersion} size={size} />);
  });
}

function triggerResizeObserver() {
  act(() => {
    const target = resizeObserverState.observedElement;
    if (!target || !resizeObserverState.callback) {
      return;
    }
    const rect = {
      height: readStylePixels(target.style.height),
      width: readStylePixels(target.style.width),
    } as DOMRectReadOnly;
    resizeObserverState.callback(
      [{ contentRect: rect, target } as unknown as ResizeObserverEntry],
      {} as ResizeObserver
    );
  });
}

function resetResizeObserverState() {
  resizeObserverState.callback = null;
  resizeObserverState.observedElement = null;
}

function installDivDimensions() {
  originalDivClientHeightDescriptor = Object.getOwnPropertyDescriptor(
    HTMLDivElement.prototype,
    'clientHeight'
  );
  originalDivClientWidthDescriptor = Object.getOwnPropertyDescriptor(
    HTMLDivElement.prototype,
    'clientWidth'
  );
  Object.defineProperty(HTMLDivElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => stageHeight,
  });
  Object.defineProperty(HTMLDivElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => stageWidth,
  });
}

function readStylePixels(value: string): number {
  return Number.parseInt(value, 10) || 0;
}

function restoreDescriptor(target: object, key: string, descriptor?: PropertyDescriptor) {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }

  Reflect.deleteProperty(target, key);
}
