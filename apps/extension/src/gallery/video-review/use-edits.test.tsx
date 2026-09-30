// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { ReviewEdit } from '../../features/video/review/types';
import { useReviewEdits } from './use-edits';

it('refuses a whole move when independent keyframe snapping would resize the edit', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.createElement('div'));
  const existing: ReviewEdit = {
    id: 'cut',
    kind: 'cut',
    start: 0,
    end: 2,
    requestedStart: 0,
    requestedEnd: 2,
  };
  const commit = vi.fn(async () => true);
  let hook!: ReturnType<typeof useReviewEdits>;
  function Harness() {
    hook = useReviewEdits({
      duration: 10,
      boundaries: [0, 2, 4, 7, 9, 10],
      snapToKeyframes: true,
      edits: [existing],
      pause: vi.fn(),
      seek: vi.fn(),
      setSelection: vi.fn(),
      commit,
    });
    return null;
  }
  try {
    act(() => root.render(<Harness />));
    await act(async () => hook.commitRange({ kind: 'range', start: 4, end: 6 }, existing));
    expect(commit).not.toHaveBeenCalled();
    await act(async () => hook.commitRange({ kind: 'range', start: 7, end: 9 }, existing));
    expect(commit).toHaveBeenCalledWith(existing, expect.objectContaining({ start: 7, end: 9 }));
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('keeps creation defaults separate from inspector edits and preserves both after a failed commit', async () => {
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
    expect(hook.rate).toBe(4);
    expect(hook.audio).toBe('mute');
    await act(async () => {
      await hook.changeRate(1.5);
      await hook.changeAudio('speed');
    });
    expect(operations).toHaveLength(1);
    expect(hook.selected).toEqual(original);
    expect(hook.rate).toBe(1.5);
    expect(hook.audio).toBe('speed');
    accepted = false;
    await act(async () => hook.changeSelectedRate(2));
    expect(hook.selected).toEqual(original);
    expect(operations).toHaveLength(1);
    accepted = true;
    await act(async () => hook.changeSelectedRate(2));
    expect(operations[1]).toMatchObject({
      before: original,
      after: { id: original.id, rate: 2 },
    });
    expect(hook.rate).toBe(1.5);
    await act(async () => hook.toggle('cut'));
    expect(operations).toHaveLength(2);
    expect(hook.mode).toBe('cut');
    expect(hook.selected?.id).toBe(original.id);
    await act(async () => hook.select(hook.selected!));
    expect(hook.mode).toBe('cut');
    expect(hook.rate).toBe(1.5);
    await act(async () => hook.commitRange({ kind: 'range', start: 4, end: 6 }, hook.selected));
    expect(operations[2]).toMatchObject({
      before: { kind: 'speed', rate: 2 },
      after: { kind: 'speed', rate: 2, start: 4, end: 6 },
    });
    expect(hook.mode).toBe('cut');
    expect(hook.rate).toBe(1.5);
    await act(async () => hook.remove());
    expect(operations[3]).toMatchObject({ before: { kind: 'speed' }, after: null });
    expect(hook.selected).toBeNull();
    expect(hook.mode).toBe('cut');
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('switches tools without applying a stale range while another timeline object is selected', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.createElement('div'));
  const commit = vi.fn(async () => true);
  let hook!: ReturnType<typeof useReviewEdits>;
  function Harness({ selectedObject }: { selectedObject: boolean }) {
    hook = useReviewEdits({
      duration: 6,
      boundaries: [0, 2, 4, 6],
      edits: [],
      selection: { kind: 'range', start: 2, end: 4 },
      selectedObject,
      pause: vi.fn(),
      seek: vi.fn(),
      setSelection: vi.fn(),
      commit,
    });
    return null;
  }
  try {
    act(() => root.render(<Harness selectedObject />));
    await act(async () => hook.toggle('cut'));
    expect(hook.mode).toBe('cut');
    expect(commit).not.toHaveBeenCalled();
    await act(async () => hook.toggle('speed'));
    expect(hook.mode).toBe('speed');
    expect(commit).not.toHaveBeenCalled();
    await act(async () => hook.toggle('speed'));
    expect(hook.mode).toBeNull();
    expect(commit).not.toHaveBeenCalled();
    act(() => root.render(<Harness selectedObject={false} />));
    await act(async () => hook.toggle('cut'));
    expect(commit).toHaveBeenCalledOnce();
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
    expect(hook.canApply('cut', { kind: 'range', start: 0, end: 2 })).toBe(true);
    let pending!: Promise<boolean | void>;
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
