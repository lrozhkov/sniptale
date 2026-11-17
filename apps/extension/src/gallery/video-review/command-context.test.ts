import { expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { ReviewDocument } from '../../features/video/review/types';
import type { ReviewTransportPosition } from './transport';
import {
  createReviewCommandPort,
  reviewCommandInsertion,
  reviewCommandSourceTime,
  type ReviewCommandContext,
} from './command-context';

function fixture() {
  const advanced = createQuickEditAdvancedState();
  const state: Omit<ReviewCommandContext, 'position'> = {
    scope: {
      session: {},
      sourceAssetId: 'source',
      resource: new Blob(['source']),
      sourceUrl: 'blob:source',
      sourceDuration: 12,
    },
    document: { annotations: [], edits: [], canvasComments: [], advancedContent: advanced },
    advanced,
    selection: { kind: 'none' },
    timelineSelection: { kind: 'point', time: 0 },
    playbackRange: { start: 4, end: 4, result: { start: 6, end: 9 } },
  };
  let position: ReviewTransportPosition = {
    epoch: 2,
    mapRevision: 3,
    resultTime: 7,
    source: { kind: 'freeze', sourceTime: 4, mediaTime: 3.98, segmentId: 'hold' },
    media: { sourceId: 'blob:source', time: 3.98 },
  };
  const readPosition = vi.fn(() => position);
  const pauseAt = vi.fn(() => true);
  let continuation: (() => void) | undefined;
  const port = createReviewCommandPort({
    read: () => state,
    readPosition,
    pauseAt,
    beforeAction: (action) => {
      continuation = action;
    },
  });
  return {
    state,
    port,
    readPosition,
    pauseAt,
    advance: (next: ReviewTransportPosition) => {
      position = next;
    },
    admit: () => continuation?.(),
  };
}

it('captures source anchor, result and raster atomically before delayed admission', () => {
  const test = fixture();
  const context = test.port.capture()!;
  const apply = vi.fn();
  test.port.admit(context, apply);
  test.advance({ ...context.position, resultTime: 8 });
  test.admit();
  expect(test.readPosition).toHaveBeenCalledOnce();
  expect(test.pauseAt).toHaveBeenCalledExactlyOnceWith(context.position);
  expect(apply).toHaveBeenCalledExactlyOnceWith(context);
  expect(reviewCommandSourceTime(context)).toBe(4);
  expect(context.position.source?.mediaTime).toBe(3.98);
  expect(reviewCommandInsertion(context, 'result')).toMatchObject({
    time: 7,
    range: { start: 6, end: 9 },
  });
});

it('detects a local temporal mutation without a durable revision and permits unrelated changes', () => {
  const test = fixture();
  const context = test.port.capture()!;
  test.state.document = {
    ...test.state.document,
    annotations: [{ id: 'note', text: 'Local', anchor: { kind: 'point', time: 2 } }],
  };
  expect(test.port.isCurrent(context, 'temporal')).toBe(true);
  test.state.document = {
    ...test.state.document,
    edits: [
      {
        id: 'hold',
        kind: 'freeze',
        start: 4,
        end: 4,
        requestedStart: 4,
        requestedEnd: 4,
        frameTime: 3.98,
        frameDuration: 0.04,
        duration: 3,
      },
    ],
  };
  expect(test.port.isCurrent(context, 'temporal')).toBe(false);
  expect(test.port.isCurrent(context, 'source')).toBe(true);
  test.port.admit(context, vi.fn());
  test.admit();
  expect(test.pauseAt).not.toHaveBeenCalled();
});

it('does not invalidate a captured map for source audio metadata alone', () => {
  const test = fixture();
  const speed: ReviewDocument['edits'][number] = {
    id: 'speed',
    kind: 'speed',
    start: 2,
    end: 5,
    requestedStart: 2,
    requestedEnd: 5,
    rate: 2,
    audio: 'speed',
  };
  test.state.document = { ...test.state.document, edits: [speed] };
  const context = test.port.capture()!;
  test.state.document = { ...test.state.document, edits: [{ ...speed, audio: 'mute' }] };
  expect(test.port.isCurrent(context, 'temporal')).toBe(true);
});

it('retains copied selection bounds but refuses a replaced source owner', () => {
  const test = fixture();
  const context = test.port.capture()!;
  test.state.playbackRange!.result!.end = 10;
  expect(context.playbackRange?.result?.end).toBe(9);
  test.state.scope = { ...test.state.scope, resource: new Blob(['replacement']) };
  expect(test.port.isCurrent(context, 'source')).toBe(false);
});

it('refuses null result position rather than silently inserting at zero', () => {
  const test = fixture();
  test.advance({
    epoch: 3,
    mapRevision: 4,
    resultTime: null,
    source: null,
    media: { sourceId: 'blob:source', time: 2.5 },
  });
  const context = test.port.capture()!;
  expect(reviewCommandInsertion(context, 'result')).toBeNull();
  expect(reviewCommandInsertion(context, 'source')?.time).toBe(2.5);
});
