import { describe, expect, it } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createQuickEditAdvancedContent } from '../../features/video/review/advanced/defaults';
import { createCanvasComment } from '../../features/video/review/comments';
import type { ReviewDocument, ReviewSelection } from '../../features/video/review/types';
import { reviewSelectionExists, selectedHistoryRemoval } from './use-review-selection';

const document: ReviewDocument = {
  edits: [{ id: 'e', kind: 'cut', start: 1, end: 2, requestedStart: 1, requestedEnd: 2 }],
  annotations: [{ id: 'a', text: 'note', anchor: { kind: 'point', time: 1 } }],
  canvasComments: [createCanvasComment({ id: 'c', at: 1 })],
  advancedContent: createQuickEditAdvancedContent(),
};

describe('review selection owner', () => {
  it('creates deletion operations only for history-owned selections', () => {
    expect(selectedHistoryRemoval({ kind: 'edit', id: 'e' }, document)).toMatchObject({
      target: 'edit',
      before: { id: 'e' },
      after: null,
    });
    expect(selectedHistoryRemoval({ kind: 'annotation', id: 'a' }, document)).toMatchObject({
      target: 'annotation',
      before: { id: 'a' },
      after: null,
    });
    expect(selectedHistoryRemoval({ kind: 'edit', id: 'missing' }, document)).toBeNull();
    expect(selectedHistoryRemoval({ kind: 'audio', lane: 'music', id: 'm' }, document)).toBeNull();
  });

  it('recognizes every live selection kind and rejects stale or unsupported ids', () => {
    const advanced = createQuickEditAdvancedState();
    advanced.zoom.regions = [
      {
        id: 'z',
        start: 0,
        end: 1,
        transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
        enter: { type: 'none', duration: 0 },
        exit: { type: 'none', duration: 0 },
      },
    ];
    advanced.audio.music = [
      {
        id: 'm',
        assetId: 'project-asset:m',
        timelineStart: 0,
        sourceOffset: 0,
        duration: 1,
        volume: 1,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
      },
    ];
    const live: ReviewSelection[] = [
      { kind: 'edit', id: 'e' },
      { kind: 'annotation', id: 'a' },
      { kind: 'canvas-comment', id: 'c' },
      { kind: 'zoom', id: 'z' },
      { kind: 'audio', lane: 'music', id: 'm' },
    ];
    for (const selection of live)
      expect(reviewSelectionExists(selection, document, advanced)).toBe(true);
    expect(reviewSelectionExists({ kind: 'none' }, document, advanced)).toBe(false);
    expect(
      reviewSelectionExists({ kind: 'zoom-link', id: 'unsupported' }, document, advanced)
    ).toBe(false);
    expect(
      reviewSelectionExists({ kind: 'audio', lane: 'voiceover', id: 'm' }, document, advanced)
    ).toBe(false);
  });
});
