import { expect, it } from 'vitest';
import { createQuickEditAdvancedState } from '../../../../features/video/review/advanced/defaults';
import { parsePortableMediaMetadata } from './media';
import { nestedMediaReviewFixture } from '../root-publication/media.review-assets.test-support';
import { encodePortableReviewAssetRefs } from '../../../../composition/persistence/review-workspaces/asset-refs';
import { createQuickEditWebcam } from '../../../../features/video/review/advanced/webcam';

function metadata() {
  return {
    entry: {
      id: 'export:e',
      kind: 'export',
      filename: 'result.webm',
      originalFilename: 'result.webm',
      source: { kind: 'project-export', exportId: 'e', projectId: 'p' },
      mimeType: 'video/webm',
      createdAt: 1,
      updatedAt: 1,
      duration: 2,
      size: 6,
      width: 640,
      height: 360,
      sourceUrl: null,
      sourceTitle: null,
      sourceFavicon: null,
      tags: [],
    },
    originalObjectId: 'o',
    projectExport: {
      id: 'e',
      projectId: 'p',
      filename: 'result.webm',
      createdAt: 1,
      duration: 2,
      size: 6,
      width: 640,
      height: 360,
      fps: 30,
      mimeType: 'video/webm',
    },
    videoReview: {
      workspace: {
        aggregateId: 'export:e',
        formatVersion: 1,
        source: { duration: 2, width: 640, height: 360, size: 6, mimeType: 'video/webm' },
        revision: 1,
        cursor: 0,
        history: [],
        createdAt: 1,
        updatedAt: 1,
      },
      draft: null,
    },
  };
}

function recordingMetadata() {
  return {
    entry: {
      id: 'recording:recording-one',
      kind: 'recording',
      filename: 'recording.webm',
      originalFilename: 'recording.webm',
      source: { kind: 'recording', recordingId: 'recording-one' },
      mimeType: 'video/webm',
      createdAt: 1,
      updatedAt: 1,
      duration: 2,
      size: 6,
      width: 640,
      height: 360,
      sourceUrl: null,
      sourceTitle: null,
      sourceFavicon: null,
      tags: [],
    },
    originalObjectId: 'recording-object',
    recording: {
      entry: {
        createdAt: 1,
        filename: 'recording.webm',
        id: 'recording-one',
        mimeType: 'video/webm',
        size: 6,
      },
    },
  };
}

it('parses a standalone project video review without changing the supplied metadata', () => {
  const input = metadata();
  const before = structuredClone(input);
  // A legacy portable workspace parses as the v2 normalized record the restore writes.
  expect(parsePortableMediaMetadata(input).videoReview).toEqual({
    ...input.videoReview,
    workspace: { ...input.videoReview.workspace, advanced: createQuickEditAdvancedState() },
  });
  expect(input).toEqual(before);
});

it('admits a durable scenario image and a project audio file as portable library roots', () => {
  const image = metadata();
  const { projectExport: _export, videoReview: _review, ...imageRoot } = image;
  expect(
    parsePortableMediaMetadata({
      ...imageRoot,
      entry: {
        ...imageRoot.entry,
        id: 'scenario-asset:one',
        kind: 'image',
        mimeType: 'image/png',
        filename: 'image.png',
        originalFilename: 'image.png',
        source: { kind: 'stored-asset', assetId: 'portable' },
      },
    }).entry.source
  ).toEqual({ kind: 'stored-asset', assetId: 'portable' });
  expect(
    parsePortableMediaMetadata({
      ...imageRoot,
      entry: {
        ...imageRoot.entry,
        id: 'project-asset:audio',
        kind: 'audio',
        mimeType: 'audio/webm',
        filename: 'audio.webm',
        originalFilename: 'audio.webm',
        source: { kind: 'project-asset', projectAssetId: 'audio' },
      },
      projectAsset: {
        id: 'audio',
        mimeType: 'audio/webm',
        size: 6,
        createdAt: 1,
      },
    }).projectAsset?.mimeType
  ).toBe('audio/webm');
});

it('rejects invalid byte ownership, local identity, history and review source', () => {
  const input = metadata();
  expect(() =>
    parsePortableMediaMetadata({
      ...input,
      projectExport: { ...input.projectExport, id: 'different' },
    })
  ).toThrow('association');
  expect(() =>
    parsePortableMediaMetadata({
      ...input,
      projectExport: { ...input.projectExport, assetId: 'local' },
    })
  ).toThrow('association');
  expect(() => parsePortableMediaMetadata({ ...input, recording: {} })).toThrow('multiple');
  for (const patch of [
    { aggregateId: 'wrong' },
    { cursor: 1 },
    { source: { ...input.videoReview.workspace.source, size: 7 } },
  ]) {
    expect(() =>
      parsePortableMediaMetadata({
        ...input,
        videoReview: {
          ...input.videoReview,
          workspace: { ...input.videoReview.workspace, ...patch },
        },
      })
    ).toThrow();
  }
  expect(() => parsePortableMediaMetadata({ ...input, projectExport: undefined })).toThrow(
    'association'
  );
});

it('accepts historical WebM project exports without an explicit MIME type', () => {
  const input = metadata();
  const { mimeType: _mime, ...projectExport } = input.projectExport;
  expect(parsePortableMediaMetadata({ ...input, projectExport }).videoReview).toEqual({
    ...input.videoReview,
    workspace: { ...input.videoReview.workspace, advanced: createQuickEditAdvancedState() },
  });
});

it('requires an exact recording source and sidecar identity association', () => {
  const input = recordingMetadata();
  expect(parsePortableMediaMetadata(input).recording?.entry.id).toBe('recording-one');
  expect(() => parsePortableMediaMetadata({ ...input, recording: undefined })).toThrow(
    'recording association'
  );
  expect(() =>
    parsePortableMediaMetadata({
      ...input,
      recording: { entry: { ...input.recording.entry, id: 'other-recording' } },
    })
  ).toThrow('recording association');
  expect(() =>
    parsePortableMediaMetadata({
      ...input,
      entry: { ...input.entry, id: 'recording:other-recording' },
    })
  ).toThrow('recording association');
});

it('refuses a published root that declares private acquisition membership', async () => {
  const { createMediaLibraryEntry } =
    await import('../../../../composition/persistence/projects/index.test-support');
  const entry = createMediaLibraryEntry({
    id: 'project-asset:public',
    kind: 'video',
    mimeType: 'video/webm',
    source: { kind: 'project-asset', projectAssetId: 'public' },
  });
  expect(() =>
    parsePortableMediaMetadata({
      entry,
      originalObjectId: 'body',
      projectAsset: {
        id: 'public',
        mimeType: entry.mimeType,
        size: entry.size,
        createdAt: 1,
        originMediaId: 'private-origin',
      },
    })
  ).toThrow('association is invalid');
});

it('roundtrips raw phase descriptors and stable observation identities in explicit backup', () => {
  const input = recordingMetadata();
  const telemetry = {
    recordingId: 'recording-one',
    captureMode: 'TAB',
    createdAt: 1,
    updatedAt: 1,
    viewport: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [],
    observationClock: {
      version: 1,
      domain: 'observation',
      segments: [
        {
          id: 'phase',
          documentId: 'doc',
          timeOriginMs: 100000,
          startedAtTimestampMs: 5000,
          observationStartSeconds: 5,
          mediaStartEstimateSeconds: 0.4,
          mapping: null,
        },
      ],
    },
    capabilities: {
      version: 1,
      pointer: 'available',
      keyboard: 'available',
      wheel: 'available',
      coverage: 'document',
      timing: { mode: 'approximate', accuracyMs: null },
    },
  };
  const portable = { ...input, recording: { ...input.recording, telemetry } };
  const restored = parsePortableMediaMetadata(JSON.parse(JSON.stringify(portable)));
  expect(restored.recording?.telemetry).toEqual(telemetry);
  expect(portable.recording.telemetry.observationClock.domain).toBe('observation');
});

it.each([false, true])('admits an exact reachable private review closure (cycle=%s)', (cycle) => {
  const input = nestedMediaReviewFixture(cycle).metadata;
  const before = structuredClone(input);
  const parsed = parsePortableMediaMetadata(input);
  expect(parsed.reviewAssets?.map((asset) => asset.entry.id)).toEqual(['b', 'c']);
  expect(parsed.reviewAssets?.[0]?.videoReview?.workspace.cursor).toBe(0);
  expect(parsed.reviewAssets?.[0]?.videoReview?.workspace.history).toHaveLength(1);
  expect(parsed.reviewAssets?.[1]?.videoReview?.draft?.annotation.text).toBe('Draft c');
  expect(input).toEqual(before);
});

it('preserves legacy direct-only resources without optional private reviews', () => {
  const input = nestedMediaReviewFixture(false).metadata;
  const { videoReview: _nested, ...asset } = input.reviewAssets[0]!;
  const parsed = parsePortableMediaMetadata({ ...input, reviewAssets: [asset] });
  expect(parsed.reviewAssets).toEqual([asset]);
});

it('refuses missing, duplicate, foreign and borrowed private review declarations', () => {
  const input = nestedMediaReviewFixture(false).metadata;
  expect(() =>
    parsePortableMediaMetadata({ ...input, reviewAssets: [input.reviewAssets[0]] })
  ).toThrow('references');
  expect(() =>
    parsePortableMediaMetadata({
      ...input,
      reviewAssets: [...input.reviewAssets, input.reviewAssets[0]],
    })
  ).toThrow('duplicate');
  for (const patch of [
    { libraryMediaId: 'project-asset:b', publishToLibrary: undefined },
    {
      videoReview: {
        ...input.reviewAssets[0]!.videoReview,
        workspace: {
          ...input.reviewAssets[0]!.videoReview.workspace,
          aggregateId: 'project-asset:foreign',
        },
      },
    },
    { entry: { ...input.reviewAssets[0]!.entry, mimeType: 'image/png' } },
    { entry: { ...input.reviewAssets[0]!.entry, mimeType: 'video/mp4' } },
    { entry: { ...input.reviewAssets[0]!.entry, size: 7 } },
  ])
    expect(() =>
      parsePortableMediaMetadata({
        ...input,
        reviewAssets: [{ ...input.reviewAssets[0], ...patch }, input.reviewAssets[1]],
      })
    ).toThrow();
});

it('refuses a disconnected private review cycle even when every declaration is referenced by another orphan', () => {
  const input = nestedMediaReviewFixture(false).metadata;
  const orphan = (id: string, child: string) => ({
    entry: { id, createdAt: 1, size: 6, mimeType: 'video/webm' },
    filename: `${id}.webm`,
    objectId: `${id}-object`,
    publishToLibrary: false,
    videoReview: encodePortableReviewAssetRefs({
      workspace: {
        aggregateId: `project-asset:${id}`,
        formatVersion: 1,
        source: input.videoReview.workspace.source,
        revision: 1,
        cursor: 0,
        history: [],
        advanced: {
          ...createQuickEditAdvancedState(),
          webcam: createQuickEditWebcam(
            `project-asset:${child}`,
            input.videoReview.workspace.source,
            input.videoReview.workspace.source
          ),
        },
        createdAt: 1,
        updatedAt: 1,
      },
      draft: null,
    }),
  });
  expect(() =>
    parsePortableMediaMetadata({
      ...input,
      reviewAssets: [...input.reviewAssets, orphan('d', 'e'), orphan('e', 'd')],
    })
  ).toThrow('references');
});

it('accepts a native PNG project export and rejects a contradictory source MIME', () => {
  const { videoReview: _review, ...input } = metadata();
  input.entry.mimeType = 'image/png';
  input.entry.filename = 'saved.png';
  input.entry.originalFilename = 'saved.png';
  input.projectExport.mimeType = 'image/png';
  input.projectExport.filename = 'saved.png';
  expect(parsePortableMediaMetadata(input).projectExport?.mimeType).toBe('image/png');
  input.projectExport.mimeType = 'video/webm';
  expect(() => parsePortableMediaMetadata(input)).toThrow('association is invalid');
});
