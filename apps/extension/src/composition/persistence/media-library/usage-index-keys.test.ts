import { expect, it } from 'vitest';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import { createQuickEditWebcam } from '../../../features/video/review/advanced/webcam';
import { reviewAdvancedContentBaseline } from '../../../features/video/review/document';
import {
  withReviewWorkspaceUsage,
  withVideoProjectUsage,
  usageReferenceKey,
  USAGE_INDEX_MARKER,
} from './usage-index-keys';

it('indexes current, undo, redo and recovery review references, including disabled resources', () => {
  const webcam = (id: string) => ({
    ...createQuickEditWebcam(
      `project-asset:${id}`,
      { width: 640, height: 480 },
      { width: 1920, height: 1080 }
    ),
    enabled: false,
  });
  const advanced = {
    ...createQuickEditAdvancedState(),
    webcam: webcam('current'),
    recoveryV1: JSON.stringify({ webcam: webcam('recovery') }),
  };
  const result = withReviewWorkspaceUsage({
    aggregateId: 'review',
    formatVersion: 1,
    sourceAssetId: 'root',
    source: { duration: 12, width: 1920, height: 1080, mimeType: 'video/webm', size: 100 },
    revision: 1,
    cursor: 0,
    createdAt: 1,
    updatedAt: 1,
    advanced,
    history: [
      {
        id: 'edit',
        at: 1,
        target: 'advancedContent',
        before: { ...reviewAdvancedContentBaseline(advanced), webcam: webcam('current') },
        after: { ...reviewAdvancedContentBaseline(advanced), webcam: webcam('after') },
      },
    ],
    usageReferenceKeys: ['untrusted-import'],
  });
  expect(new Set(result.usageReferenceKeys)).toEqual(
    new Set([
      USAGE_INDEX_MARKER,
      usageReferenceKey('library-asset', 'review'),
      ...['current', 'recovery', 'after'].map((id) => usageReferenceKey('project-asset', id)),
    ])
  );
});
it('never trusts imported derived keys on an unsupported document', () => {
  expect(
    withVideoProjectUsage({ id: 'invalid', usageReferenceKeys: ['forged'] }).usageReferenceKeys
  ).toEqual([USAGE_INDEX_MARKER]);
  expect(
    withReviewWorkspaceUsage({ aggregateId: 'invalid', usageReferenceKeys: ['forged'] })
      .usageReferenceKeys
  ).toEqual([USAGE_INDEX_MARKER]);
});
