// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import type { EditorDocument } from '../../../features/editor/document/types';
import { createMockDocument } from '../instance/bindings/test-fixtures-document';
import { createDeferredEditorHistory, scheduleEditorHistoryAfterPaint } from './deferred';

it('uses a task without waiting for a frame when its page is hidden', () => {
  vi.useFakeTimers();
  try {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const frame = vi.spyOn(window, 'requestAnimationFrame');
    const callback = vi.fn();
    const cancel = scheduleEditorHistoryAfterPaint(callback);
    expect(frame).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(callback).toHaveBeenCalledOnce();
    cancel();
  } finally {
    vi.useRealTimers();
    vi.restoreAllMocks();
  }
});

it('releases a queued frame when the page hides and cancels the replacement task on disposal', () => {
  vi.useFakeTimers();
  try {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame');
    const callback = vi.fn();
    const cancel = scheduleEditorHistoryAfterPaint(callback);
    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cancelFrame).toHaveBeenCalledWith(42);
    cancel();
    vi.runOnlyPendingTimers();
    expect(callback).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
    vi.restoreAllMocks();
  }
});

function fixture() {
  let revision = 0;
  const callbacks: Array<() => void> = [];
  const committed: string[] = [];
  const commit = vi.fn((document: EditorDocument) => {
    committed.push(document.sourceName ?? '');
    revision += 1;
  });
  const queue = createDeferredEditorHistory({
    revision: () => revision,
    commit,
    maxPending: 50,
    schedule: (callback) => {
      callbacks.push(callback);
      return vi.fn();
    },
  });
  const onFailure = vi.fn();
  const enqueue = (name: string) =>
    queue.enqueue({
      document: { ...createMockDocument(), sourceName: name },
      isCurrent: () => true,
      onCommitted: vi.fn(),
      onFailure,
    });
  return {
    queue,
    callbacks,
    committed,
    commit,
    enqueue,
    onFailure,
    advance: () => {
      revision += 1;
    },
  };
}

it('retains separate captured steps without encoding before the scheduled turn', () => {
  const f = fixture();
  f.enqueue('first');
  f.enqueue('second');
  expect(f.committed).toEqual([]);
  expect(f.queue.getCount()).toBe(2);
  expect(f.queue.peek()?.sourceName).toBe('second');
  f.callbacks[0]!();
  expect(f.committed).toEqual(['first', 'second']);
  expect(f.queue.getCount()).toBe(0);
});

it('drains before explicit mutations and refuses the obsolete scheduled callback', () => {
  const f = fixture();
  f.enqueue('first');
  f.queue.flush();
  f.enqueue('second');
  f.callbacks[0]!();
  expect(f.committed).toEqual(['first']);
  f.callbacks[1]!();
  expect(f.committed).toEqual(['first', 'second']);
});

it.each(['cancel', 'revision'] as const)(
  'cannot commit after %s invalidates its lifetime',
  (cause) => {
    const f = fixture();
    f.enqueue('old');
    if (cause === 'cancel') f.queue.cancel();
    else f.advance();
    f.callbacks[0]!();
    expect(f.committed).toEqual([]);
    expect(f.queue.getCount()).toBe(0);
  }
);

it('keeps failed and subsequent steps for retry without repeating committed steps', () => {
  const f = fixture();
  f.enqueue('first');
  f.enqueue('second');
  f.commit.mockImplementationOnce((document) => {
    f.committed.push(document.sourceName ?? '');
    f.advance();
  });
  f.commit.mockImplementationOnce(() => {
    throw new Error('encoding failed');
  });
  f.callbacks[0]!();
  expect(f.onFailure).toHaveBeenCalledOnce();
  expect(f.queue.getCount()).toBe(1);
  expect(f.queue.peek()?.sourceName).toBe('second');
  f.queue.flush();
  expect(f.committed).toEqual(['first', 'second']);
  expect(f.queue.getCount()).toBe(0);
});
