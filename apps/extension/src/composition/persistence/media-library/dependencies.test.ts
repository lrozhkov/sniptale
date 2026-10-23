import { createCameraFollowSettings } from '../../../features/video/project/camera/cursor-policy';
import { expect, it } from 'vitest';
import {
  parseVideoDependencyEnvelope,
  scenarioChildUsesMedia,
  videoSourceUsesMedia,
  videoEntryIsUnrelated,
  type MediaDependencyTarget,
} from './dependencies';
import type { MediaAssetSource } from './contracts';
import { createVideoProjectEntryWithMediaClip } from '../projects/index.test-support';

const targets = {
  screenshot: { id: 'image', source: { kind: 'screenshot' } },
  'stored-asset': { id: 'stored', source: { kind: 'stored-asset', assetId: 'object' } },
  recording: { id: 'recording:record', source: { kind: 'recording', recordingId: 'record' } },
  'project-asset': {
    id: 'project-asset:source',
    source: { kind: 'project-asset', projectAssetId: 'source' },
  },
  'project-export': {
    id: 'export:output',
    source: { kind: 'project-export', exportId: 'output', projectId: 'montage' },
  },
  'web-snapshot': { id: 'web', source: { kind: 'web-snapshot', snapshotId: 'snapshot' } },
} satisfies Record<MediaAssetSource['kind'], MediaDependencyTarget>;

it.each([3, 4, 5] as const)(
  'admits v%s relationships and refuses invalid or future locators',
  (version) => {
    const entry = createVideoProjectEntryWithMediaClip({
      version,
      actionFeedback: [],
      ...(version >= 4 ? { cameraFollowDefaults: createCameraFollowSettings() } : {}),
    });
    expect(parseVideoDependencyEnvelope(entry)).not.toBeNull();
    expect(videoEntryIsUnrelated(entry, targets.screenshot, new Set())).toBe(true);
    const related = {
      ...entry,
      project: {
        ...entry.project,
        assets: [
          { ...entry.project.assets[0]!, source: { kind: 'recording', recordingId: 'record' } },
        ],
      },
    };
    expect(videoEntryIsUnrelated(related, targets.recording, new Set())).toBe(false);
    expect(
      parseVideoDependencyEnvelope({ ...entry, project: { ...entry.project, version: 6 } })
    ).toBeNull();
    expect(
      videoEntryIsUnrelated(
        {
          ...entry,
          project: {
            ...entry.project,
            assets: [{ source: { kind: 'recording', recordingId: 42 } }],
          },
        },
        targets.screenshot,
        new Set()
      )
    ).toBe(false);
  }
);

it.each(Object.values(targets))(
  'retains insertion membership across source types: $source.kind',
  (target) => {
    const child = { id: 'child', assetId: 'private', galleryAssetId: target.id };
    expect(scenarioChildUsesMedia(child, target)).toBe(true);
    expect(
      videoSourceUsesMedia(
        { kind: 'project-asset', projectAssetId: 'private', originMediaId: target.id },
        target,
        new Set()
      )
    ).toBe(true);
    expect(
      videoSourceUsesMedia({ kind: 'library-asset', mediaId: target.id }, target, new Set())
    ).toBe(true);
  }
);

it('does not infer a material relationship from shared physical bytes', () => {
  const child = { id: 'independent', assetId: 'object', galleryAssetId: null };
  expect(scenarioChildUsesMedia(child, targets['stored-asset'])).toBe(false);
  expect(
    scenarioChildUsesMedia(child, {
      id: 'scenario-asset:independent',
      source: targets['stored-asset'].source,
    })
  ).toBe(true);
});

it.each(['image', false, '', null])(
  'never treats an invalid or related video insertion locator as disjoint: %j',
  (originMediaId) => {
    const entry = createVideoProjectEntryWithMediaClip();
    const value = {
      ...entry,
      project: {
        ...entry.project,
        effectSnapshots: 'invalid',
        assets: [{ source: { kind: 'project-asset', projectAssetId: 'private', originMediaId } }],
      },
    };
    expect(videoEntryIsUnrelated(value, targets.screenshot, new Set())).toBe(false);
  }
);

it('protects a recording insertion represented by project-owned bytes', () => {
  expect(
    videoSourceUsesMedia(
      { kind: 'project-asset', projectAssetId: 'copy', originRecordingId: 'record' },
      targets.recording,
      new Set()
    )
  ).toBe(true);
});

it('retains canonical scenario identity after its published root bytes are replaced', () => {
  expect(
    scenarioChildUsesMedia(
      { id: 'captured', assetId: 'frozen-old', galleryAssetId: null },
      { id: 'scenario-asset:captured', source: { kind: 'stored-asset', assetId: 'published-new' } }
    )
  ).toBe(true);
});

it('retains dormant background sources and refuses schema fourteen deletion shortcuts', () => {
  const entry = createVideoProjectEntryWithMediaClip();
  const retained = {
    ...entry,
    project: {
      ...entry.project,
      version: 14,
      sceneBackground: {
        kind: 'solid',
        color: '#123456',
        remembered: {
          image: { kind: 'image', assetId: entry.project.assets[0]!.id, imageFit: 'contain' },
        },
      },
    },
  };
  expect(videoEntryIsUnrelated(retained, targets.recording, new Set())).toBe(false);
  expect(videoEntryIsUnrelated(retained, targets.screenshot, new Set())).toBe(false);
  expect(
    videoSourceUsesMedia({ kind: 'recording', recordingId: 'record' }, targets.recording, new Set())
  ).toBe(true);
});
