import { expect, it } from 'vitest';
import { createQuickEditAdvancedState } from '../../../../features/video/review/advanced/defaults';
import { parsePortableMediaMetadata } from './media';

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
