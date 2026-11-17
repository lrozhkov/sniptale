import { createReviewCommandFixture } from './editor-fixture.test-support';
import { expect, it, vi } from 'vitest';
import { useReviewCommentActions } from './use-review-comments';
it('uses command admission pause adapters for point and range comments', () => {
  const nativePause = vi.fn(),
    pause = vi.fn(),
    seek = vi.fn(),
    change = vi.fn();
  const input = {
    commands: createReviewCommandFixture(() => ({ duration: 10, time: 4 }), { pause }),
    composer: { change },
    time: 4,
    playbackRange: null,
    video: { current: { pause: nativePause } },
    pause,
    seek,
    setSelection: vi.fn(),
    setSelected: vi.fn(),
    setCutting: vi.fn(),
    canStart: () => true,
    busy: false,
    exporterPhase: 'idle',
  } as unknown as Parameters<typeof useReviewCommentActions>[0];
  const point = { id: 'point', text: 'Comment', anchor: { kind: 'point' as const, time: 4 } };
  useReviewCommentActions(input).select(point);
  useReviewCommentActions(input).add();
  expect(pause).toHaveBeenCalledTimes(2);
  expect(nativePause).not.toHaveBeenCalled();
  expect(seek).toHaveBeenCalledWith(4, false);
  const fallback = useReviewCommentActions({
    ...input,
    pause: undefined,
    commands: createReviewCommandFixture(() => ({ duration: 10, time: 4 }), { pause: nativePause }),
  });
  fallback.select({ ...point, anchor: { kind: 'range', start: 3, end: 5 } });
  fallback.add();
  expect(nativePause).toHaveBeenCalledTimes(2);
  expect(change).toHaveBeenCalledTimes(2);
});
