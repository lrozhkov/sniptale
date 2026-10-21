import { expect, it } from 'vitest';
import { createCanvasComment } from '../../review/comments';
import { createVideoProjectFromRecording } from '../factories/creation';
import { applyVideoProjectMutationPatch } from '../mutation';
import { isExportReadyVideoProject, isHydratableVideoProject } from '../validation/root';
import {
  parseVideoProjectCommentDocuments,
  hasValidVideoProjectCommentReferences,
} from './validation';
import type { VideoProjectCommentDocument } from './types';

function document(): VideoProjectCommentDocument {
  return {
    id: 'comments',
    binding: { kind: 'project' },
    annotations: [
      {
        id: 'note',
        text: 'Inspect this area',
        anchor: { kind: 'range', start: 2, end: 4 },
        region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        telemetryRef: { kind: 'action', id: 'event' },
      },
    ],
    canvasComments: [
      {
        ...createCanvasComment({ id: 'bubble', annotationId: 'note', start: 2, end: 4 }),
        renderToVideo: false,
        placement: 'below',
        style: {
          ...createCanvasComment({ id: 'style' }).style,
          width: 320,
          fontSize: 24,
          padding: 10,
        },
      },
    ],
  };
}

it('retains complete linked note and bubble metadata through shared parsing without changing the input', () => {
  const entry = document();
  const original = structuredClone(entry);
  expect(parseVideoProjectCommentDocuments([entry])).toEqual([entry]);
  expect(entry).toEqual(original);
  const parsed = parseVideoProjectCommentDocuments([entry])![0]!;
  expect(parsed).not.toBe(entry);
  expect(parsed.annotations[0]).not.toBe(entry.annotations[0]);
  expect(parsed.canvasComments[0]?.style).not.toBe(entry.canvasComments[0]?.style);
  expect(parseVideoProjectCommentDocuments([{ ...entry, annotations: [] }])).not.toBeNull();
});

it('refuses malformed or duplicate identities and budgets atomically across documents', () => {
  const entry = document();
  for (const bad of [
    null,
    {},
    { ...entry, id: ' ' },
    { ...entry, binding: { kind: 'source', assetId: 'a' } },
    { ...entry, binding: { kind: 'project', assetId: 'a' } },
    { ...entry, extra: true },
    { ...entry, annotations: [entry.annotations[0], entry.annotations[0]] },
    { ...entry, canvasComments: [entry.canvasComments[0], entry.canvasComments[0]] },
    { ...entry, annotations: [{ ...entry.annotations[0], text: null }] },
    { ...entry, canvasComments: [{ ...entry.canvasComments[0], end: 1 }] },
    { ...entry, canvasComments: [{ ...entry.canvasComments[0], position: { x: NaN, y: 0.5 } }] },
    {
      ...entry,
      canvasComments: [
        { ...entry.canvasComments[0], style: { ...entry.canvasComments[0]!.style, fontSize: 99 } },
      ],
    },
  ])
    expect(parseVideoProjectCommentDocuments([entry, bad])).toBeNull();
  expect(parseVideoProjectCommentDocuments([entry, entry])).toBeNull();
  expect(
    parseVideoProjectCommentDocuments(
      Array.from({ length: 2001 }, (_, index) => ({
        ...entry,
        id: String(index),
        annotations: [],
        canvasComments: [],
      }))
    )
  ).toBeNull();
  expect(
    parseVideoProjectCommentDocuments([
      {
        ...entry,
        annotations: Array.from({ length: 2001 }, (_, index) => ({
          ...entry.annotations[0]!,
          id: String(index),
        })),
        canvasComments: [],
      },
    ])
  ).toBeNull();
  const overlays = Array.from({ length: 51 }, (_, index) => ({
    ...entry.canvasComments[0]!,
    id: String(index),
  }));
  expect(
    parseVideoProjectCommentDocuments([
      { ...entry, canvasComments: overlays },
      { ...entry, id: 'second', canvasComments: overlays },
    ])
  ).toBeNull();
  expect(
    parseVideoProjectCommentDocuments([
      { ...entry, canvasComments: overlays },
      { ...entry, id: 'second', canvasComments: overlays.slice(0, 49) },
    ])
  ).toHaveLength(2);
});

it('keeps local identities independent between documents and refuses an invalid source binding', () => {
  const first = document();
  const second = {
    ...first,
    id: 'second',
    binding: { kind: 'source', assetId: 'asset', sourceInstanceId: 'instance' },
  };
  expect(parseVideoProjectCommentDocuments([first, second])).toHaveLength(2);
  for (const binding of [
    { kind: 'source', assetId: '', sourceInstanceId: 'instance' },
    { kind: 'source', assetId: 'asset', sourceInstanceId: 'instance', clipId: 'guess' },
  ])
    expect(parseVideoProjectCommentDocuments([{ ...first, binding }])).toBeNull();
});

it('admits schema23 through real root parsing and preserves the version after removal without opening writes', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'video.webm',
    width: 640,
    height: 360,
    duration: 10,
    mimeType: 'video/webm',
    size: 100,
  });
  const changed = applyVideoProjectMutationPatch(project, { commentDocuments: [document()] });
  expect(changed.version).toBe(23);
  expect(isHydratableVideoProject(changed)).toBe(true);
  expect(isExportReadyVideoProject(JSON.parse(JSON.stringify(changed)))).toBe(true);
  expect(project.commentDocuments).toBeUndefined();
  for (let version = 2; version < 23; version++)
    expect(isHydratableVideoProject({ ...changed, version })).toBe(false);
  expect(isHydratableVideoProject({ ...changed, version: 25 })).toBe(false);
  expect(
    isHydratableVideoProject({
      ...changed,
      commentDocuments: [{ ...document(), canvasComments: null }],
    })
  ).toBe(false);
  const removed = { ...changed };
  delete removed.commentDocuments;
  expect(applyVideoProjectMutationPatch(removed, {}).version).toBe(23);
  expect(applyVideoProjectMutationPatch(changed, { name: 'Renamed' }).commentDocuments).toBe(
    changed.commentDocuments
  );
});

it('retains dormant source documents and validates exact VIDEO asset identity and native time bounds', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'video.webm',
    width: 640,
    height: 360,
    duration: 10,
    mimeType: 'video/webm',
    size: 100,
  });
  const clip = project.clips.find((item) => item.type === 'VIDEO')!;
  if (clip.type !== 'VIDEO') throw new Error('Missing video');
  const entry = {
    ...document(),
    binding: {
      kind: 'source' as const,
      assetId: clip.assetId,
      sourceInstanceId: clip.sourceInstanceId ?? clip.id,
    },
  };
  const changed = applyVideoProjectMutationPatch(project, { commentDocuments: [entry] });
  expect(hasValidVideoProjectCommentReferences(changed)).toBe(true);
  expect(isExportReadyVideoProject({ ...changed, clips: [], duration: 0 })).toBe(true);
  expect(hasValidVideoProjectCommentReferences({ ...changed, assets: [] })).toBe(false);
  expect(
    hasValidVideoProjectCommentReferences({
      ...changed,
      assets: changed.assets.map((asset) => ({ ...asset, type: 'AUDIO' })),
    })
  ).toBe(false);
  expect(
    hasValidVideoProjectCommentReferences({ ...changed, clips: [{ ...clip, assetId: 'foreign' }] })
  ).toBe(false);
  expect(
    hasValidVideoProjectCommentReferences({
      ...changed,
      commentDocuments: [
        {
          ...entry,
          annotations: [{ ...entry.annotations[0]!, anchor: { kind: 'point', time: 11 } }],
        },
      ],
    })
  ).toBe(false);
  expect(
    hasValidVideoProjectCommentReferences({
      ...changed,
      commentDocuments: [{ ...entry, canvasComments: [{ ...entry.canvasComments[0]!, end: 11 }] }],
    })
  ).toBe(false);
  expect(isHydratableVideoProject({ ...changed, assets: [] })).toBe(true);
});
