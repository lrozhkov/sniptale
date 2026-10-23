import { expect, it } from 'vitest';
import { createEmptyVideoProject, createVideoProjectAsset } from '../factories/creation';
import { createVideoClipFromAsset } from '../factories/clip';
import { VideoProjectAssetType } from '../types';
import { createReviewCaptionSettings } from '../../review/text-document';
import { planReviewCaptions } from '../../review/caption-plan';
import type { VideoProjectTextDocument } from './types';
import { hasVideoProjectCaptions, videoProjectCaptionInput } from './captions';

function entry(id: string): VideoProjectTextDocument {
  return {
    id,
    binding: { kind: 'project' },
    captions: { ...createReviewCaptionSettings(), enabled: true },
    document: {
      version: 1,
      fragments: [
        {
          id: 'same',
          text: 'Caption',
          originalText: 'Caption',
          start: 1,
          end: 3,
          timeDomain: 'result',
          alignment: 'manual',
          revision: 0,
          timingRevision: 0,
          showInVideo: true,
        },
      ],
    },
  };
}
it('packs overlapping documents together with distinct identities and inherited styles', () => {
  const first = entry('one');
  const second = entry('two');
  second.captions!.style = { ...second.captions!.style, color: '#ff0000' };
  const project = {
    ...createEmptyVideoProject('Captions'),
    duration: 10,
    textDocuments: [first, second],
  };
  const before = structuredClone(project);
  const plan = planReviewCaptions({
    ...videoProjectCaptionInput(project),
    output: { width: 640, height: 360 },
    measure: (text, pixels) => text.length * pixels * 0.5,
  });
  expect(plan.conflicts).toEqual([]);
  expect(plan.cues).toHaveLength(2);
  expect(plan.cues[0]!.fragmentId).not.toBe(plan.cues[1]!.fragmentId);
  expect(plan.cues[0]!.y).not.toBe(plan.cues[1]!.y);
  expect(plan.cues[1]!.style.color).toBe('#ff0000');
  expect(project).toEqual(before);
});
it('excludes disabled, hidden and dormant documents without changing authored data', () => {
  const disabled = entry('disabled');
  disabled.captions!.enabled = false;
  const hidden = entry('hidden');
  hidden.document.fragments[0]!.showInVideo = false;
  const dormant = entry('dormant');
  dormant.binding = { kind: 'source', assetId: 'retained', sourceInstanceId: 'removed' };
  const project = {
    ...createEmptyVideoProject('Excluded'),
    duration: 10,
    textDocuments: [disabled, hidden, dormant],
  };
  expect(hasVideoProjectCaptions(project, { start: 0, end: 10 })).toBe(false);
  const input = videoProjectCaptionInput(project);
  expect(
    planReviewCaptions({ ...input, output: { width: 640, height: 360 }, measure: () => 10 }).cues
  ).toEqual([]);
  project.textDocuments.push(entry('visible'));
  expect(hasVideoProjectCaptions(project, { start: 3, end: 4 })).toBe(false);
  expect(hasVideoProjectCaptions(project, { start: 2, end: 3 })).toBe(true);
});
it('projects every subdivided word block through reordered, accelerated source placements', () => {
  const source = entry('source');
  source.binding = { kind: 'source', assetId: 'asset', sourceInstanceId: 'instance' };
  const words = Array.from({ length: 24 }, (_, index) => ({
    text: `word${index}`,
    start: index,
    end: index + 1,
  }));
  source.document.fragments[0] = {
    ...source.document.fragments[0]!,
    text: words.map((word) => word.text).join(' '),
    alignment: 'word',
    timeDomain: 'source',
    start: 0,
    end: 24,
    words,
  };
  const project = { ...createEmptyVideoProject('Source'), duration: 30, textDocuments: [source] };
  const asset = createVideoProjectAsset(
    'Source',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'media' },
    {
      width: 640,
      height: 360,
      duration: 24,
      mimeType: 'video/mp4',
      size: 100,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360, 10);
  if (clip.type !== 'VIDEO') throw new Error('Expected video clip');
  project.clips = [
    {
      ...clip,
      sourceInstanceId: 'instance',
      sourceStart: 0,
      sourceDuration: 12,
      duration: 6,
      playbackRate: 2,
    },
    {
      ...clip,
      id: 'earlier',
      sourceInstanceId: 'instance',
      startTime: 0,
      sourceStart: 12,
      sourceDuration: 12,
      duration: 6,
      playbackRate: 2,
    },
  ];
  source.binding = { kind: 'source', assetId: asset.id, sourceInstanceId: 'instance' };
  const input = videoProjectCaptionInput(project);
  const plan = planReviewCaptions({
    ...input,
    output: { width: 240, height: 360 },
    measure: (text, pixels) => text.length * pixels * 0.5,
  });
  expect(plan.cues.length).toBeGreaterThan(2);
  const first = plan.cues.find((cue) => cue.lines.join(' ').includes('word0'))!;
  const last = plan.cues.find((cue) => cue.lines.join(' ').includes('word23'))!;
  expect(first.start).toBe(10);
  expect(first.end).toBeLessThan(16);
  expect(last.end).toBe(6);
  expect(last.start).toBeGreaterThan(0);
  expect(source.document.fragments[0]!.words).toEqual(words);
});
