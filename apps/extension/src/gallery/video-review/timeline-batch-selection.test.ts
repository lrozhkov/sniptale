import { expect, it } from 'vitest';
import {
  resolveReviewTimelineSelection,
  reviewSelectionFromTimelineKey,
  removeReviewTimelineSelection,
} from './timeline-batch-selection';
import { createQuickEditAdvancedContent } from '../../features/video/review/advanced/defaults';
import { createQuickEditAudioClip } from '../../features/video/review/advanced/audio';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';

it('resolves clip ownership and colon-containing identities against retained content', () => {
  const content = createQuickEditAdvancedContent();
  content.audio.music = [
    createQuickEditAudioClip({
      id: 'clip:music',
      assetId: 'asset:1',
      timelineStart: 0,
      duration: 2,
      endMax: 10,
    }),
  ];
  expect(resolveReviewTimelineSelection('audio:clip:music', content)).toEqual({
    kind: 'audio',
    lane: 'music',
    id: 'clip:music',
  });
  expect(resolveReviewTimelineSelection('audio:missing', content)).toBeNull();
  expect(reviewSelectionFromTimelineKey('telemetry:action:source:event')).toEqual({
    kind: 'telemetry',
    ref: { kind: 'action', id: 'source:event' },
  });
  expect(reviewSelectionFromTimelineKey('telemetry:unknown:event')).toBeNull();
});

it('removes mixed authored items without deleting other clips, source records, or resource identities', () => {
  const content = createQuickEditAdvancedContent();
  content.zoom.regions = [createQuickEditZoomRegion({ id: 'focus', at: 0, duration: 2 })];
  content.audio.music = [
    createQuickEditAudioClip({
      id: 'music',
      assetId: 'asset:1',
      timelineStart: 0,
      duration: 2,
      endMax: 10,
    }),
  ];
  content.audio.voiceover = [
    createQuickEditAudioClip({
      id: 'keep',
      assetId: 'asset:2',
      timelineStart: 0,
      duration: 2,
      endMax: 10,
    }),
  ];
  const original = structuredClone(content);
  const next = removeReviewTimelineSelection(
    content,
    [
      { kind: 'zoom', id: 'focus' },
      { kind: 'audio', lane: 'music', id: 'music' },
    ],
    10
  );
  expect(next.zoom.regions).toEqual([]);
  expect(next.audio.music).toEqual([]);
  expect(next.audio.voiceover).toEqual(original.audio.voiceover);
  expect(content).toEqual(original);
});
