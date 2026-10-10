import { expect, it } from 'vitest';
import {
  assertPortableReviewAssetRefs,
  collectReviewAssetReferences,
  decodePortableReviewAssetRefs,
  encodePortableReviewAssetRefs,
  remapReviewAssetReferences,
} from './asset-refs';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import { createQuickEditWebcam } from '../../../features/video/review/advanced/webcam';
import { reviewAdvancedContentBaseline } from '../../../features/video/review/document';
import type { VideoWorkspaceSnapshot } from './contracts';

it('retains mixed-history assets while compact gain contains no reference or remapping authority', () => {
  const baseline = createQuickEditAdvancedState();
  const before = reviewAdvancedContentBaseline(baseline);
  const after = {
    ...before,
    webcam: createQuickEditWebcam(
      'project-asset:camera',
      { width: 640, height: 480 },
      { width: 1920, height: 1080 }
    ),
  };
  const snapshot: VideoWorkspaceSnapshot = {
    draft: null,
    workspace: {
      aggregateId: 'recording:mixed',
      sourceAssetId: 'source',
      formatVersion: 1,
      source: { duration: 12, width: 1920, height: 1080, mimeType: 'video/webm', size: 100 },
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      advanced: baseline,
      cursor: 0,
      history: [
        { id: 'camera', at: 1, target: 'advancedContent', before, after },
        {
          id: 'gain',
          at: 2,
          target: 'sourceAudio',
          before: { muted: false, volume: 1 },
          after: { muted: true, volume: 0.5 },
        },
      ],
    },
  };
  const original = structuredClone(snapshot);
  expect(collectReviewAssetReferences(snapshot.workspace)).toEqual(
    new Set(['project-asset:camera'])
  );
  const restored = remapReviewAssetReferences(snapshot, new Map([['camera', 'copy']]));
  expect(collectReviewAssetReferences(restored.workspace)).toEqual(new Set(['project-asset:copy']));
  expect(restored.workspace.history[1]).toBe(snapshot.workspace.history[1]);
  const encoded = encodePortableReviewAssetRefs(restored);
  expect(() => assertPortableReviewAssetRefs(encoded.workspace)).not.toThrow();
  const decoded = decodePortableReviewAssetRefs(encoded.workspace);
  expect(decoded.history[1]).toEqual(snapshot.workspace.history[1]);
  expect(snapshot).toEqual(original);
});
