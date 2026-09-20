// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { ReviewEdit } from '../../features/video/review/types';
import { useReviewEdits } from './use-edits';

it('commits speed properties once, updates the selected edit, and preserves selection on failure', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.createElement('div'));
  let hook!: ReturnType<typeof useReviewEdits>;
  let accepted = true;
  const operations: { before: ReviewEdit | null; after: ReviewEdit | null }[] = [];
  function Harness() {
    const [edits, setEdits] = useState<ReviewEdit[]>([]);
    hook = useReviewEdits({
      duration: 6,
      boundaries: [0, 2, 4, 6],
      edits,
      pause: vi.fn(),
      seek: vi.fn(),
      setSelection: vi.fn(),
      commit: async (before, after) => {
        if (!accepted) return false;
        operations.push({ before, after });
        setEdits((current) => [
          ...current.filter((item) => item.id !== before?.id),
          ...(after ? [after] : []),
        ]);
        return true;
      },
    });
    return null;
  }
  try {
    act(() => root.render(<Harness />));
    await act(async () => hook.toggle('speed'));
    await act(async () => {
      await hook.changeRate(4);
      await hook.changeAudio('mute');
    });
    expect(operations).toHaveLength(0);
    await act(async () => hook.commitRange({ kind: 'range', start: 2, end: 4 }));
    expect(operations).toHaveLength(1);
    expect(hook.selected).toMatchObject({ kind: 'speed', rate: 4, audio: 'mute' });
    const original = hook.selected!;
    accepted = false;
    await act(async () => hook.changeRate(1.5));
    expect(hook.selected).toEqual(original);
    expect(operations).toHaveLength(1);
    accepted = true;
    await act(async () => hook.changeRate(1.5));
    expect(operations[1]).toMatchObject({
      before: original,
      after: { id: original.id, rate: 1.5 },
    });
    await act(async () => hook.toggle('cut'));
    await act(async () => hook.commitRange({ kind: 'range', start: 2, end: 4 }));
    expect(operations).toHaveLength(2);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('applies a tool immediately to an existing selected interval and selects the new edit', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.createElement('div'));
  const commit = vi.fn(async () => true),
    seek = vi.fn(),
    onSelectedEditIdChange = vi.fn();
  let hook!: ReturnType<typeof useReviewEdits>;
  function Harness() {
    hook = useReviewEdits({
      duration: 6,
      boundaries: [0, 2, 4, 6],
      edits: [],
      selection: { kind: 'range', start: 2, end: 4 },
      pause: vi.fn(),
      seek,
      setSelection: vi.fn(),
      commit,
      onSelectedEditIdChange,
    });
    return null;
  }
  try {
    act(() => root.render(<Harness />));
    await act(async () => hook.toggle('cut'));
    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ kind: 'cut', start: 2, end: 4 })
    );
    expect(onSelectedEditIdChange).toHaveBeenCalledWith(expect.any(String));
    expect(seek).toHaveBeenCalledWith(2);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('rejects duplicate and failed interval commands without losing selection, and does not seek on resize', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.createElement('div'));
  let resolve!: (accepted: boolean) => void;
  const commit = vi.fn(
    () =>
      new Promise<boolean>((done) => {
        resolve = done;
      })
  );
  const seek = vi.fn(),
    setSelection = vi.fn(),
    onSelectedEditIdChange = vi.fn();
  const existing = {
    id: 'speed',
    requestedStart: 0,
    requestedEnd: 1,
    kind: 'speed' as const,
    start: 0,
    end: 1,
    rate: 2 as const,
    audio: 'speed' as const,
  };
  let hook!: ReturnType<typeof useReviewEdits>;
  function Harness() {
    hook = useReviewEdits({
      duration: 6,
      boundaries: [0, 1, 2, 3, 4, 6],
      edits: [existing],
      selection: { kind: 'range', start: 2, end: 4 },
      pause: vi.fn(),
      seek,
      setSelection,
      commit,
      onSelectedEditIdChange,
    });
    return null;
  }
  try {
    act(() => root.render(<Harness />));
    expect(hook.canApply('cut', { kind: 'range', start: 0, end: 2 })).toBe(false);
    let pending!: Promise<void>;
    act(() => {
      pending = hook.toggle('cut');
    });
    await act(async () => hook.toggle('cut'));
    expect(commit).toHaveBeenCalledOnce();
    await act(async () => {
      resolve(false);
      await pending;
    });
    expect(setSelection).not.toHaveBeenCalled();
    expect(onSelectedEditIdChange).not.toHaveBeenCalled();
    act(() => {
      pending = hook.commitRange({ kind: 'range', start: 0, end: 2 }, existing);
    });
    await act(async () => {
      resolve(true);
      await pending;
    });
    expect(seek).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
