import { expect, it } from 'vitest';
import {
  createQuickEditAdvancedContent,
  createQuickEditAdvancedState,
} from '../../../features/video/review/advanced/defaults';
import type { VideoWorkspace } from './contracts';
import { collectReviewAssetReferences } from './asset-refs';
import { stripReviewAssetReference } from './strip-asset';
import { createQuickEditWebcam } from '../../../features/video/review/advanced/webcam';

const removed = 'project-asset:voice-old';
const retained = 'project-asset:music-new';

it.each([0, 1])(
  'removes a webcam-only operation without corrupting history cursor %i',
  (cursor) => {
    const workspace = makeWorkspace();
    const before = createQuickEditAdvancedContent();
    const after = {
      ...before,
      webcam: createQuickEditWebcam(
        removed,
        { width: 640, height: 480 },
        { width: 640, height: 360 }
      ),
    };
    workspace.advanced = createQuickEditAdvancedState();
    workspace.history = [{ id: 'camera', at: 1, target: 'advancedContent', before, after }];
    workspace.cursor = cursor;
    const result = stripReviewAssetReference(workspace, removed, 2);
    expect(result.history).toEqual([]);
    expect(result.cursor).toBe(0);
    expect(collectReviewAssetReferences(result).size).toBe(0);
  }
);

it('detaches disabled camera from baseline, undo/redo and recovery without resurrection', () => {
  const workspace = makeWorkspace();
  const webcam = {
    ...createQuickEditWebcam(removed, { width: 640, height: 480 }, { width: 640, height: 360 }),
    enabled: false,
  };
  workspace.advanced.webcam = webcam;
  workspace.advanced.recoveryV1 = JSON.stringify({ webcam });
  for (const operation of workspace.history) {
    if (operation.target !== 'advancedContent') continue;
    operation.before.webcam = webcam;
    operation.after.webcam = { ...webcam, offsetSeconds: 1 };
  }
  const result = stripReviewAssetReference(workspace, removed, 2);
  expect(result.advanced).not.toHaveProperty('webcam');
  expect(JSON.parse(result.advanced.recoveryV1!)).not.toHaveProperty('webcam');
  expect(collectReviewAssetReferences(result)).toEqual(new Set([retained]));
  for (const operation of result.history) {
    if (operation.target !== 'advancedContent') continue;
    expect(operation.before).not.toHaveProperty('webcam');
    expect(operation.after).not.toHaveProperty('webcam');
  }
  expect(workspace.advanced.webcam).toEqual(webcam);
});

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

it('removes remembered backgrounds from current, history and recovery while keeping visible paint', () => {
  const workspace = makeWorkspace();
  const background = {
    enabled: true as const,
    type: 'solid' as const,
    color: '#000000ff',
    layout: { padding: 40, cornerRadius: 12 },
    rememberedImage: { assetId: removed, imageFit: 'contain' as const },
  };
  workspace.advanced.background = background;
  workspace.advanced.recoveryV1 = JSON.stringify({ background });
  for (const operation of workspace.history) {
    if (operation.target !== 'advancedContent') continue;
    operation.before.background = background;
    operation.after.background = background;
  }
  const result = stripReviewAssetReference(workspace, removed, 2);
  expect(result.advanced.background).toEqual({
    enabled: true,
    type: 'solid',
    color: '#000000ff',
    layout: background.layout,
  });
  expect(collectReviewAssetReferences(result)).toEqual(new Set([retained]));
  expect(JSON.parse(result.advanced.recoveryV1!).background).not.toHaveProperty('rememberedImage');
  expect(workspace.advanced.background).toEqual(background);
});
