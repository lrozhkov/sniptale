import { resolveVideoCompositionCursor } from '../composition/timeline/frame/cursor';
import { evaluateCursorMotion } from './cursor-motion';
import { authoredCursorFocusPath, updateCursorFocusKey } from './cursor-focus-path/authoring';
import { resolveProjectCursorFocusPath } from './cursor-focus-path/projection';
import { resolveProjectCursorFocus } from './cursor-focus-path/projection';
import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from './factories/creation';
import { applyVideoProjectMutationPatch } from './mutation';
import { parseHydratableVideoProject, isExportReadyVideoProject } from './validation/root';
import {
  parseVideoProjectSourceInteractionDocuments,
  resolveProjectSourceInteractionDocument,
  type VideoProjectSourceInteractionDocument,
} from './source-interaction-documents';

function fixture() {
  const seed = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'Source.webm',
    width: 640,
    height: 360,
    duration: 8,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: true,
  });
  const video = seed.clips.find((clip) => clip.type === 'VIDEO')!;
  const document: VideoProjectSourceInteractionDocument = {
    id: 'source-input',
    binding: { assetId: video.assetId, sourceInstanceId: video.sourceInstanceId! },
    cursorMotions: [
      {
        id: 'cursor',
        start: 1,
        end: 7,
        enabled: true,
        shape: 'pointer',
        size: 44,
        color: '#eeeeee',
        outline: '#222222',
        shadow: true,
        easing: 'smooth',
        points: [
          { id: 'a', at: 0, x: 0.2, y: 0.3 },
          { id: 'b', at: 1, x: 0.8, y: 0.7 },
        ],
      },
    ],
    timeline: {
      presses: [
        {
          id: 'key',
          family: 'keyboard',
          start: 2,
          end: 3,
          label: 'Cmd+K',
          keys: ['Cmd', 'K'],
          button: 0,
          x: 0.5,
          y: 0.5,
        },
      ],
      overrides: [],
    },
    cursorEnabled: true,
    keyboardEnabled: true,
    mouseEnabled: false,
  };
  return { seed, video, document };
}

it('admits detached bounded source documents and preserves authoring through versioned mutation/reopen', () => {
  const { seed, document } = fixture();
  const parsed = parseVideoProjectSourceInteractionDocuments([document]);
  expect(parsed).toEqual([document]);
  document.cursorMotions[0]!.points[0]!.x = 0.4;
  expect(parsed?.[0]?.cursorMotions[0]?.points[0]?.x).toBe(0.2);
  const project = applyVideoProjectMutationPatch(seed, { sourceInteractionDocuments: [document] });
  expect(project.version).toBe(54);
  expect(
    parseHydratableVideoProject(JSON.parse(JSON.stringify(project)))?.sourceInteractionDocuments
  ).toEqual([document]);
  expect(parseHydratableVideoProject({ ...project, version: 53 })).toBeNull();
  expect(parseHydratableVideoProject(seed)).not.toBeNull();
});
it('rejects malformed, duplicate, foreign and ambiguous source references before export', () => {
  const { seed, document, video } = fixture();
  expect(
    parseVideoProjectSourceInteractionDocuments([{ ...document, unexpected: true }])
  ).toBeNull();
  expect(
    parseVideoProjectSourceInteractionDocuments([{ ...document, cursorEnabled: 'true' }])
  ).toBeNull();
  expect(parseVideoProjectSourceInteractionDocuments([document, document])).toBeNull();
  expect(
    parseVideoProjectSourceInteractionDocuments([
      { ...document, cursorMotions: [{ ...document.cursorMotions[0], size: 999 }] },
    ])
  ).toBeNull();
  expect(
    parseVideoProjectSourceInteractionDocuments([
      {
        ...document,
        timeline: {
          presses: [],
          overrides: [{ ref: { kind: 'foreign', id: 'bad' }, start: 0, end: 1, enabled: true }],
        },
      },
    ])
  ).toBeNull();
  expect(
    isExportReadyVideoProject({
      ...seed,
      version: 54,
      sourceInteractionDocuments: [
        { ...document, binding: { ...document.binding, assetId: 'foreign' } },
      ],
    })
  ).toBe(false);
  const other = { ...seed.assets[0]!, id: 'another' };
  expect(
    isExportReadyVideoProject({
      ...seed,
      version: 54,
      assets: [...seed.assets, other],
      clips: seed.clips.map((clip) =>
        clip.id === video.id ? { ...clip, assetId: other.id } : clip
      ),
      sourceInteractionDocuments: [document],
    })
  ).toBe(false);
});
it('uses the exact active clip source clock across speed, relocation, held frames and hidden tracks', () => {
  const { seed, video, document } = fixture();
  const clip = {
    ...video,
    startTime: 10,
    duration: 2,
    sourceStart: 2,
    sourceDuration: 4,
    playbackRate: 2,
    playbackWindow: { offset: 0, holdAt: 0.5 },
  };
  const project = { ...seed, clips: [clip], sourceInteractionDocuments: [document] };
  expect(resolveProjectSourceInteractionDocument(project, 10.25)?.sourceTime).toBe(2.5);
  expect(resolveProjectSourceInteractionDocument(project, 11)?.sourceTime).toBe(3);
  expect(resolveProjectSourceInteractionDocument(project, 12)).toBeNull();
  expect(resolveProjectSourceInteractionDocument(project, 10.25, 'foreign')).toBeNull();
  expect(
    resolveProjectSourceInteractionDocument(
      { ...project, tracks: seed.tracks.map((track) => ({ ...track, visible: false })) },
      10.25
    )
  ).toBeNull();
  expect(resolveProjectSourceInteractionDocument({ ...project, clips: [] }, 10.25)).toBeNull();
});

it('uses the same authored curve for Native cursor pixels and camera focus without rewriting source facts', () => {
  const { seed, document, video } = fixture();
  const project = applyVideoProjectMutationPatch(seed, { sourceInteractionDocuments: [document] });
  const before = structuredClone(project);
  const expected = evaluateCursorMotion(document.cursorMotions, 3)!;
  const cursor = resolveVideoCompositionCursor(project, 3, [], video.id);
  expect(cursor).toMatchObject({
    artwork: { shape: 'pointer', color: '#eeeeee', outline: '#222222', shadow: true },
    scale: 44 / 256,
  });
  expect(cursor?.x).toBeCloseTo(expected.x * seed.width, 8);
  expect(cursor?.y).toBeCloseTo(expected.y * seed.height, 8);
  const focus = resolveProjectCursorFocus(project, 3, undefined, video.id);
  expect(focus?.x).toBeCloseTo(expected.x * seed.width, 8);
  expect(focus?.y).toBeCloseTo(expected.y * seed.height, 8);
  expect(resolveVideoCompositionCursor(project, 7, [], video.id)).toBeNull();
  expect(
    resolveVideoCompositionCursor(
      { ...project, sourceInteractionDocuments: [{ ...document, cursorEnabled: false }] },
      3,
      [],
      video.id
    )
  ).toBeNull();
  expect(project).toEqual(before);
});

it('preserves subsequent Native focus edits over transferred source cursor motion', () => {
  const { seed, document } = fixture();
  const project = applyVideoProjectMutationPatch(seed, { sourceInteractionDocuments: [document] });
  const path = resolveProjectCursorFocusPath(project);
  const key = path.segments.flatMap((segment) => segment.keys)[0]!;
  const edited = applyVideoProjectMutationPatch(project, {
    cursorFocusPath: authoredCursorFocusPath(
      updateCursorFocusKey(path, key.id, { x: 0.7, y: 0.8 })
    ),
  });
  expect(
    resolveProjectCursorFocusPath(edited)
      .segments.flatMap((segment) => segment.keys)
      .find((item) => item.id === key.id)
  ).toMatchObject({ x: 0.7, y: 0.8 });
  expect(edited.sourceInteractionDocuments).toEqual(project.sourceInteractionDocuments);
  expect(resolveProjectCursorFocusPath(project)).toEqual(path);
});

it('bounds and validates retained Native presentation edits independently of captured facts', () => {
  const { document } = fixture();
  for (const actionOverrides of [
    null,
    [{ id: 'key', presentation: { enabled: 'yes' } }],
    [{ id: 'key', presentation: { point: { x: 2, y: 0 } } }],
    [{ id: 'key', presentation: { unknown: true } }],
    [
      { id: 'key', presentation: { enabled: false } },
      { id: 'key', presentation: { enabled: true } },
    ],
  ])
    expect(
      parseVideoProjectSourceInteractionDocuments([{ ...document, actionOverrides }])
    ).toBeNull();
  const actionOverrides = [{ id: 'key', presentation: { enabled: false } }];
  expect(
    parseVideoProjectSourceInteractionDocuments([{ ...document, actionOverrides }])?.[0]
      ?.actionOverrides
  ).toEqual(actionOverrides);
});
