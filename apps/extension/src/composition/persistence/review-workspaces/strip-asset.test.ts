import { expect, it } from 'vitest';
import {
  createQuickEditAdvancedContent,
  createQuickEditAdvancedState,
} from '../../../features/video/review/advanced/defaults';
import type { VideoWorkspace } from './contracts';
import { collectReviewAssetReferences } from './asset-refs';
import { stripReviewAssetReference } from './strip-asset';

const removed = 'project-asset:voice-old';
const retained = 'project-asset:music-new';

function makeWorkspace(): VideoWorkspace {
  const before = createQuickEditAdvancedContent();
  const after = {
    ...before,
    background: {
      enabled: true as const,
      type: 'image' as const,
      assetId: removed,
      imageFit: 'cover' as const,
      layout: { padding: 0, cornerRadius: 0 },
    },
    audio: {
      ...before.audio,
      voiceover: [
        {
          id: 'voice',
          assetId: removed,
          timelineStart: 0,
          sourceOffset: 0,
          duration: 1,
          volume: 1,
          muted: false,
          fadeIn: 0,
          fadeOut: 0,
        },
      ],
      music: [
        {
          id: 'music',
          assetId: retained,
          timelineStart: 0,
          sourceOffset: 0,
          duration: 1,
          volume: 1,
          muted: false,
          fadeIn: 0,
          fadeOut: 0,
        },
      ],
    },
  };
  return {
    aggregateId: 'recording:source',
    formatVersion: 1,
    source: { duration: 10, width: 640, height: 360, mimeType: 'video/webm', size: 100 },
    sourceAssetId: 'source-object',
    revision: 1,
    history: [{ id: 'op', at: 1, target: 'advancedContent', before, after }],
    cursor: 1,
    advanced: {
      ...createQuickEditAdvancedState(),
      recoveryV1: JSON.stringify({
        audio: { voiceover: [{ assetId: removed }], music: [{ assetId: retained }] },
      }),
    },
    createdAt: 1,
    updatedAt: 1,
  };
}

it('removes auxiliary material from current, undo/redo and recovery without touching other media', () => {
  const workspace = makeWorkspace();
  const result = stripReviewAssetReference(workspace, removed, 2);
  expect([...collectReviewAssetReferences(result)]).toEqual([retained]);
  expect(result.revision).toBe(2);
  expect(result.history[0]).toMatchObject({
    after: {
      background: { enabled: false },
      audio: { voiceover: [], music: [{ assetId: retained }] },
    },
  });
  expect(workspace.history[0]).toMatchObject({
    after: { audio: { voiceover: [{ assetId: removed }] } },
  });
});

it('preserves an unrelated workspace without changing its revision', () => {
  const workspace = makeWorkspace();
  expect(stripReviewAssetReference(workspace, 'project-asset:other', 2)).toBe(workspace);
});

it('rejects deletion when the selected material is the required source', () => {
  const workspace = { ...makeWorkspace(), sourceAssetId: removed };
  expect(() => stripReviewAssetReference(workspace, removed, 2)).toThrow(
    'required quick-edit source'
  );
});

it('preserves unreadable legacy recovery while stripping valid current and history references', () => {
  const workspace = makeWorkspace();
  workspace.advanced.recoveryV1 = '{invalid';
  const result = stripReviewAssetReference(workspace, removed, 2);
  expect(result.advanced.recoveryV1).toBe('{invalid');
  expect([...collectReviewAssetReferences(result)]).toEqual([retained]);
});
