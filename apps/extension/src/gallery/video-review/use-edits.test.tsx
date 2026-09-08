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
    act(() => hook.toggle('speed'));
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
    act(() => hook.toggle('cut'));
    await act(async () => hook.commitRange({ kind: 'range', start: 2, end: 4 }));
    expect(operations).toHaveLength(2);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
