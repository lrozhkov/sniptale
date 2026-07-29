import type { Dispatch, SetStateAction } from 'react';
import { vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';

export function resetServiceTestEnvironment() {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
}

export function createRuntime(frames: FrameData[], onAnchorUnavailable = vi.fn()) {
  const framesRef = { current: frames };
  const setFrames: Dispatch<SetStateAction<FrameData[]>> = (update) => {
    framesRef.current = typeof update === 'function' ? update(framesRef.current) : update;
  };
  return {
    framesRef,
    onAnchorUnavailable,
    runtime: {
      frameStatesRef: { current: new Map() },
      framesRef,
      onAnchorUnavailable,
      setFrames,
    },
  };
}

export function installDynamicRect(element: HTMLElement, read: () => DOMRectInit) {
  vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => DOMRect.fromRect(read()));
  vi.spyOn(element, 'getClientRects').mockImplementation(() =>
    createRectList(DOMRect.fromRect(read()))
  );
}

function createRectList(...rects: DOMRect[]): DOMRectList {
  const list: DOMRectList = {
    [Symbol.iterator]: () => rects[Symbol.iterator](),
    item: (index) => rects[index] ?? null,
    length: rects.length,
  };
  rects.forEach((rect, index) => Object.defineProperty(list, index, { value: rect }));
  return list;
}

export function dispatchAnimationSignal(
  target: Element,
  type: 'animationend' | 'animationiteration' | 'animationstart',
  animationName: string
) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'animationName', { value: animationName });
  target.dispatchEvent(event);
}
