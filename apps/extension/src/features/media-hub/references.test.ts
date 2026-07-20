import { expect, it } from 'vitest';

import {
  collectReferencedRecordingIdReferences,
  collectReferencedProjectAssetIds,
  collectReferencedRecordingIds,
} from './references';
import { createVideoProject } from '../../composition/persistence/projects/index.test-support.ts';
import { createVideoProjectAsset } from '../video/project/factories/creation';
import {
  VideoProjectAssetType,
  VideoProjectSourceKind,
  type VideoProjectAsset,
} from '../video/project/types/index';

function createAssetSourceMetadata() {
  return {
    audioPeaks: null,
    duration: 10,
    hasAudio: true,
    height: 720,
    mimeType: 'video/webm',
    size: 1024,
    width: 1280,
  };
}

function createProjectAssetSource(): VideoProjectAsset {
  return createVideoProjectAsset(
    'Project asset',
    VideoProjectAssetType.VIDEO,
    {
      kind: 'project-asset',
      originRecordingId: 'origin-recording',
      projectAssetId: 'project-asset-1',
    },
    createAssetSourceMetadata()
  );
}

it('collects recording references across media and project domains', () => {
  const mediaEntries = [
    { source: { kind: 'recording', recordingId: 'media-recording' } },
    {
      source: {
        kind: 'project-export',
        exportId: 'export-1',
        projectId: 'project-1',
        recordingId: 'export-recording',
      },
    },
  ];
  const projectExports = [{ recordingId: 'project-export-recording' }];
  const projects = [
    null,
    {
      assets: [
        { source: { kind: 'recording', recordingId: 'project-recording' } },
        { source: { kind: 'project-asset', originRecordingId: 'origin-recording' } },
      ],
      baseRecordingId: 'base-recording',
      source: { kind: 'recording', recordingId: 'source-recording' },
    },
  ];

  expect(collectReferencedRecordingIds({ mediaEntries, projectExports, projects })).toEqual(
    new Set([
      'media-recording',
      'export-recording',
      'project-export-recording',
      'base-recording',
      'source-recording',
      'project-recording',
      'origin-recording',
    ])
  );
});

it('accepts non-recording media and project sources without cleanup warnings', () => {
  const result = collectReferencedRecordingIdReferences({
    mediaEntries: [
      { source: { kind: 'screenshot' } },
      { source: { kind: 'project-asset', projectAssetId: 'asset-1' } },
      { source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' } },
    ],
    projectExports: [],
    projects: [
      {
        assets: [{ source: { kind: 'scenario-asset', scenarioAssetId: 'scenario-asset-1' } }],
        baseRecordingId: null,
        source: { kind: 'scenario', scenarioProjectId: 'scenario-project-1' },
      },
    ],
  });

  expect(result.recordingIds).toEqual(new Set());
  expect(result.invalidReferenceCount).toBe(0);
});

it('skips malformed recording reference rows without dropping valid visible references', () => {
  const result = collectReferencedRecordingIdReferences({
    mediaEntries: [
      { source: null },
      { source: { kind: 'recording' } },
      { source: { kind: 'recording', recordingId: 'media-recording' } },
    ],
    projectExports: [{ recordingId: 'export-recording' }, { recordingId: 42 }],
    projects: [
      { assets: [], baseRecordingId: null, source: null },
      { assets: [], baseRecordingId: null, source: { kind: 'recording' } },
      {
        assets: [{ source: { kind: 'project-asset', originRecordingId: 'origin-recording' } }],
        baseRecordingId: 'base-recording',
        source: { kind: 'recording', recordingId: 'source-recording' },
      },
    ],
  });

  expect(result.recordingIds).toEqual(
    new Set([
      'media-recording',
      'export-recording',
      'base-recording',
      'source-recording',
      'origin-recording',
    ])
  );
  expect(result.invalidReferenceCount).toBe(6);
});

it('collects project asset ids from typed video projects', () => {
  const project = createVideoProject({
    assets: [
      createProjectAssetSource(),
      createVideoProjectAsset(
        'Recording asset',
        VideoProjectAssetType.VIDEO,
        { kind: 'recording', recordingId: 'recording-1' },
        createAssetSourceMetadata()
      ),
    ],
    source: { kind: VideoProjectSourceKind.MANUAL },
  });

  expect(collectReferencedProjectAssetIds([null, project])).toEqual(new Set(['project-asset-1']));
});
