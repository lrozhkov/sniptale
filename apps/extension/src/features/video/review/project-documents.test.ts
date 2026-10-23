import { expect, it, vi } from 'vitest';
import {
  createAudioClip,
  createProject,
  createVideoClip,
} from '../project/timeline/project-meta.test.helpers';
import { applyVideoProjectMutationPatch } from '../project/mutation';
import { calculateProjectDuration } from '../project/timeline/basics';
import { isExportReadyVideoProject, parseHydratableVideoProject } from '../project/validation/root';
import { projectVideoProjectTextFragment } from '../project/text/projection';
import { projectVideoProjectCommentAnchor } from '../project/comments/projection';
import { videoProjectCaptionInput } from '../project/text/captions';
import { createCanvasComment } from './comments';
import { createReviewCaptionSettings } from './text-document';
import { planReviewCaptions } from './caption-plan';
import { mapReviewAnchor, buildReviewTimeMap } from './timeline';
import { projectReviewTextFragment } from './text-projection';
import type { ReviewAnnotation, ReviewEdit } from './types';
import type { ReviewTextDocument, ReviewTextFragment } from './text-types';
import { planReviewProjectTimeline } from './project-timeline';
import { planReviewProjectDocuments } from './project-documents';

function fragment(
  id: string,
  start: number,
  end: number,
  domain: 'source' | 'result' = 'source'
): ReviewTextFragment {
  return {
    id,
    start,
    end,
    text: id,
    originalText: id,
    revision: 3,
    timingRevision: 2,
    timeDomain: domain,
    showInVideo: true,
    alignment: 'range',
  };
}
function fixture() {
  const source = { duration: 8, width: 1280, height: 720, size: 100, mimeType: 'video/webm' };
  const edits: ReviewEdit[] = [
    { id: 'cut', kind: 'cut', start: 3, end: 4, requestedStart: 3, requestedEnd: 4 },
    {
      id: 'speed',
      kind: 'speed',
      start: 2,
      end: 6,
      requestedStart: 2,
      requestedEnd: 6,
      rate: 2,
      audio: 'speed',
    },
  ];
  const timeline = planReviewProjectTimeline({
    operationId: 'conversion-1',
    source,
    edits,
    video: createVideoClip(),
    audio: createAudioClip(),
  });
  const text: ReviewTextDocument = {
    version: 1,
    fragments: [
      {
        ...fragment('source', 2.4, 5),
        words: [{ text: 'source', start: 2.4, end: 5 }],
        origin: { kind: 'original', start: 2.4, end: 5 },
        language: 'ru',
        variantId: 'draft',
        derivedFrom: ['earlier'],
      },
      fragment('independent', 0.2, 1.2, 'result'),
      fragment('hidden', 3.1, 3.8),
    ],
  };
  const annotations: ReviewAnnotation[] = [
    {
      id: 'note',
      text: 'Remember',
      anchor: { kind: 'range', start: 2.4, end: 5 },
      region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      telemetryRef: { kind: 'action', id: 'captured' },
    },
    { id: 'hidden', text: 'Retain', anchor: { kind: 'point', time: 3.5 } },
  ];
  const canvasComments = [
    {
      ...createCanvasComment({ id: 'legacy', annotationId: 'note', start: 2.4, end: 5 }),
      renderToVideo: true,
    },
  ];
  const captions = { ...createReviewCaptionSettings(), enabled: true };
  return { timeline, text, annotations, canvasComments, captions, edits };
}
function project(
  args: ReturnType<typeof fixture>,
  planned: ReturnType<typeof planReviewProjectDocuments>
) {
  const root = createProject([...args.timeline.videoClips, ...args.timeline.audioClips]);
  return applyVideoProjectMutationPatch(root, {
    duration: args.timeline.duration,
    textDocuments: planned.textDocuments,
    commentDocuments: planned.commentDocuments,
  });
}

it('preserves mixed-clock text and provenance through real Native admission and projection', () => {
  const args = fixture();
  const before = structuredClone(args);
  const planned = planReviewProjectDocuments(args);
  const native = project(args, planned);
  expect(isExportReadyVideoProject(native)).toBe(true);
  const reopened = parseHydratableVideoProject(native)!;
  expect(reopened.textDocuments).toEqual(planned.textDocuments);
  expect(calculateProjectDuration(reopened)).toBe(args.timeline.duration);
  const map = buildReviewTimeMap(8, args.edits);
  for (const original of args.text.fragments) {
    const entry = planned.textDocuments.find((entry) =>
      entry.document.fragments.some((item) => item.id === original.id)
    )!;
    const retained = entry.document.fragments.find((item) => item.id === original.id)!;
    expect(retained).toEqual(original);
    expect(entry.captions).toEqual(args.captions);
    expect(projectVideoProjectTextFragment(reopened, entry, retained)).toEqual(
      projectReviewTextFragment(original, map)
    );
  }
  expect(args).toEqual(before);
  expect(planReviewProjectDocuments(args)).toEqual(planned);
});

it('uses the shared caption layout with the same visible cues in both editors', () => {
  const args = fixture();
  const planned = planReviewProjectDocuments(args);
  const native = videoProjectCaptionInput(project(args, planned));
  const geometry = {
    output: { width: 1280, height: 720 },
    measure: (text: string, pixels: number) => (text.length * pixels) / 2,
  };
  const gallery = planReviewCaptions({
    document: args.text,
    settings: args.captions,
    segments: buildReviewTimeMap(8, args.edits),
    ...geometry,
  });
  const converted = planReviewCaptions({ ...native, ...geometry });
  const content = (plan: ReturnType<typeof planReviewCaptions>) =>
    plan.cues
      .map(({ id: _id, fragmentId: _fragmentId, ...cue }) => cue)
      .sort((a, b) => a.start - b.start || a.end - b.end);
  expect(gallery.conflicts).toEqual([]);
  expect(converted.conflicts).toEqual([]);
  expect(content(converted)).toEqual(content(gallery));
});

it('retains cut-hidden notes and passive legacy flags without adding a render owner', () => {
  const args = fixture();
  const planned = planReviewProjectDocuments(args);
  const native = project(args, planned);
  const entry = planned.commentDocuments[0]!;
  expect(entry.annotations).toEqual(args.annotations);
  expect(entry.canvasComments).toEqual(args.canvasComments);
  for (const note of entry.annotations) {
    const original = mapReviewAnchor(note.anchor, buildReviewTimeMap(8, args.edits));
    expect(
      projectVideoProjectCommentAnchor(native, entry, note.anchor).map(({ start, end }) => ({
        start,
        end,
      }))
    ).toEqual(original.ranges);
  }
  expect(entry.binding).toEqual({
    kind: 'source',
    assetId: args.timeline.videoClips[0]!.assetId,
    sourceInstanceId: args.timeline.sourceInstanceId,
  });
  expect(entry.canvasComments[0]!.renderToVideo).toBe(true);
  entry.annotations[0]!.text = 'Changed';
  entry.canvasComments[0]!.position.x = 0.1;
  expect(args.annotations[0]!.text).toBe('Remember');
  expect(args.canvasComments[0]!.position.x).not.toBe(0.1);
});

it('retains caption-only and empty text settings without inventing fragments', () => {
  const args = fixture();
  const empty = { timeline: args.timeline, annotations: [], canvasComments: [] };
  expect(planReviewProjectDocuments(empty).textDocuments).toEqual([]);
  const planned = planReviewProjectDocuments({ ...empty, captions: args.captions });
  expect(planned.textDocuments).toHaveLength(1);
  expect(planned.textDocuments[0]).toEqual({
    id: planned.textDocumentIds.result,
    binding: { kind: 'project' },
    durationMode: 'project',
    document: { version: 1, fragments: [] },
    captions: args.captions,
  });
  const text = planReviewProjectDocuments({ ...empty, text: { version: 1, fragments: [] } });
  expect(text.textDocuments[0]!.document.fragments).toEqual([]);
  expect(text.textDocuments[0]!.captions).toBeUndefined();
});

it('preserves a retained result tail without extending the montage', () => {
  const args = fixture();
  const tail = fragment('tail', args.timeline.duration - 0.5, args.timeline.duration + 2, 'result');
  args.text.fragments.push(tail);
  const planned = planReviewProjectDocuments(args);
  expect(
    planned.textDocuments.find((entry) => entry.binding.kind === 'project')!.document.fragments
  ).toContainEqual(tail);
  expect(calculateProjectDuration(project(args, planned))).toBe(args.timeline.duration);
  const entry = planned.textDocuments.find((item) => item.binding.kind === 'project')!;
  expect(entry.durationMode).toBe('project');
  expect(projectVideoProjectTextFragment(project(args, planned), entry, tail).ranges).toEqual([
    { start: tail.start, end: args.timeline.duration },
  ]);
  expect(args.text.fragments.at(-1)).toEqual(tail);
});

it('refuses malformed branches and source bounds as a whole while preserving inputs', () => {
  const args = fixture();
  const before = structuredClone(args);
  const patches = [
    { captions: { ...args.captions, style: { ...args.captions.style, fontSize: 2 } } },
    {
      text: { version: 1 as const, fragments: [args.text.fragments[0]!, args.text.fragments[0]!] },
    },
    { annotations: [{ ...args.annotations[0]!, anchor: { kind: 'point' as const, time: 9 } }] },
    { canvasComments: [{ ...args.canvasComments[0]!, end: 9 }] },
    { timeline: { ...args.timeline, videoClips: [] } },
    {
      timeline: {
        ...args.timeline,
        audioClips: args.timeline.audioClips.map((clip) => ({
          ...clip,
          sourceInstanceId: args.timeline.sourceInstanceId,
        })),
      },
    },
  ];
  for (const patch of patches)
    expect(() => planReviewProjectDocuments({ ...args, ...patch })).toThrow(
      'Review document conversion is invalid'
    );
  expect(args).toEqual(before);
  expect(planReviewProjectDocuments(args).textDocuments).toHaveLength(2);
});

it('does not expose a partial mapping when allocation fails', () => {
  const args = fixture();
  const before = structuredClone(args);
  const clone = vi.spyOn(globalThis, 'structuredClone').mockImplementationOnce(() => {
    throw new Error('Allocation failed');
  });
  try {
    expect(() => planReviewProjectDocuments(args)).toThrow('Allocation failed');
  } finally {
    clone.mockRestore();
  }
  expect(args).toEqual(before);
  expect(planReviewProjectDocuments(args).textDocuments).toHaveLength(2);
});
