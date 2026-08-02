// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  acceptPointerDragEvent,
  commitPointerDragDraft,
  registerPointerDragSession,
} from './pointer-drag-session';

afterEach(() => {
  vi.restoreAllMocks();
});

function createPointerEvent(pointerId = 7) {
  return {
    pointerId,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

describe('pointer drag session', () => {
  it('accepts only the active pointer and suppresses its default propagation', () => {
    const event = createPointerEvent();

    expect(acceptPointerDragEvent(event, 7)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(acceptPointerDragEvent(createPointerEvent(8), 7)).toBe(false);
  });

  it('commits a draft and clears an unchanged local projection', () => {
    const pointerIdRef = { current: 7 as number | null };
    const draftRef = { current: { x: 4 } as { x: number } | null };
    const onClear = vi.fn();
    const onCommit = vi.fn();
    const onFinish = vi.fn();

    commitPointerDragDraft({
      draftRef,
      event: createPointerEvent(),
      initialValue: { x: 4 },
      isEqual: (left, right) => left.x === right?.x,
      onClear,
      onCommit,
      onFinish,
      pointerIdRef,
    });

    expect(pointerIdRef.current).toBeNull();
    expect(draftRef.current).toBeNull();
    expect(onClear).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith({ x: 4 });
    expect(onFinish).toHaveBeenCalledOnce();
  });

  it('registers and removes the complete drag lifecycle', () => {
    const documentAdd = vi.spyOn(document, 'addEventListener');
    const documentRemove = vi.spyOn(document, 'removeEventListener');
    const windowAdd = vi.spyOn(window, 'addEventListener');
    const windowRemove = vi.spyOn(window, 'removeEventListener');
    const cleanup = registerPointerDragSession({
      cancel: vi.fn(),
      move: vi.fn(),
      up: vi.fn(),
    });

    expect(documentAdd).toHaveBeenCalledTimes(4);
    expect(windowAdd).toHaveBeenCalledTimes(2);
    cleanup();
    expect(documentRemove).toHaveBeenCalledTimes(4);
    expect(windowRemove).toHaveBeenCalledTimes(2);
  });
});
