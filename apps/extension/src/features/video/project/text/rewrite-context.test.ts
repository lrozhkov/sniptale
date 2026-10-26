import { describe, expect, it } from 'vitest';
import type { ReviewTextContext } from '../../../../contracts/ai/review-text';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../factories/creation';
import { createVideoClipFromAsset } from '../factories/clip';
import { VideoProjectAssetType, VideoTrackKind } from '../types';
import type { VideoProjectTextDocument } from './types';
import { captureVideoProjectTextRewriteContext } from './rewrite-context';

const options: Pick<
  ReviewTextContext,
  'prompt' | 'mode' | 'wholeDocument' | 'changeIntervals' | 'resegment'
> = {
  prompt: 'Make the text clear',
  mode: 'phrases',
  wholeDocument: false,
  changeIntervals: false,
  resegment: false,
};

function fixture() {
  const project = createEmptyVideoProject('Private project');
  const asset = createVideoProjectAsset(
    'Private source',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'private-media' },
    {
      width: 640,
      height: 360,
      duration: 10,
      mimeType: 'video/webm',
      size: 100,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360, 2);
  if (clip.type !== 'VIDEO') throw new Error('Missing video clip');
  project.assets = [asset];
  project.clips = [clip];
  project.duration = 30;
  const entry: VideoProjectTextDocument = {
    id: 'private-document',
    binding: { kind: 'source', assetId: asset.id, sourceInstanceId: clip.id },
    document: {
      version: 1,
      fragments: [
        {
          id: 'phrase',
          text: 'Two words',
          originalText: 'Original words',
          revision: 3,
          timingRevision: 2,
          alignment: 'word',
          start: 1,
          end: 9,
          timeDomain: 'source',
          showInVideo: false,
          language: 'en',
          words: [{ text: 'Two', start: 1, end: 2 }],
          origin: { kind: 'original', clipId: 'private-origin', start: 1, end: 9 },
        },
      ],
    },
  };
  project.textDocuments = [entry];
  return { project, clip, entry, fragment: entry.document.fragments[0]! };
}

describe('captureVideoProjectTextRewriteContext', () => {
  it('discloses only selected authored text and its bound source instance without mutation', () => {
    const { project, clip, entry } = fixture();
    project.clips.push({ ...clip, id: 'another-instance', startTime: 15 });
    const before = structuredClone(project);
    const context = captureVideoProjectTextRewriteContext(project, entry.id, ['phrase'], options);
    expect(context).toEqual({
      ...options,
      version: 1,
      window: { start: 3, end: 11 },
      fragments: [{ id: 'phrase', text: 'Two words', language: 'en', start: 3, end: 11 }],
    });
    expect(project).toEqual(before);
    for (const privateId of [project.id, clip.id, clip.trackId, entry.id, 'private-origin'])
      expect(JSON.stringify(context)).not.toContain(privateId);
    context.fragments[0]!.text = 'Changed disclosure';
    expect(project).toEqual(before);
  });

  it('preserves fully covered cuts, reordered rates, multiple lanes, gaps, overlaps and duplicate placements', () => {
    const { project, clip, entry } = fixture();
    const otherTrack = createVideoProjectTrack('Other lane', 1, VideoTrackKind.PRIMARY);
    project.tracks.push(otherTrack);
    clip.sourceInstanceId = clip.id;
    project.clips = [
      {
        ...clip,
        id: 'late-first',
        sourceStart: 5,
        sourceDuration: 5,
        duration: 2.5,
        playbackRate: 2,
        startTime: 0,
      },
      { ...clip, id: 'early-later', sourceStart: 0, sourceDuration: 5, duration: 5, startTime: 10 },
      {
        ...clip,
        id: 'overlap',
        sourceStart: 0,
        sourceDuration: 10,
        duration: 10,
        startTime: 9,
        trackId: otherTrack.id,
      },
      {
        ...clip,
        id: 'duplicate',
        sourceStart: 0,
        sourceDuration: 10,
        duration: 10,
        startTime: 9,
        trackId: otherTrack.id,
      },
    ];
    const context = captureVideoProjectTextRewriteContext(project, entry.id, ['phrase'], options);
    expect(context.fragments[0]).toEqual({
      id: 'phrase',
      text: 'Two words',
      language: 'en',
      start: 0,
      end: 18,
      ranges: [
        { start: 0, end: 2 },
        { start: 10, end: 18 },
        { start: 10, end: 18 },
        { start: 11, end: 15 },
      ],
    });
    expect(context.window).toEqual({ start: 0, end: 18 });
  });

  it('takes the maximum end across nested ranges rather than the last sorted range', () => {
    const { project, clip, entry } = fixture();
    clip.sourceInstanceId = clip.id;
    project.clips = [
      { ...clip, id: 'outer', startTime: 0 },
      { ...clip, id: 'inner', startTime: 2, duration: 5, playbackRate: 2 },
    ];
    expect(
      captureVideoProjectTextRewriteContext(project, entry.id, ['phrase'], options).fragments[0]
    ).toMatchObject({
      start: 1,
      end: 9,
      ranges: [
        { start: 1, end: 9 },
        { start: 2.5, end: 6.5 },
      ],
    });
  });

  it('scopes wholeDocument to the explicit document and keeps project binding in result time', () => {
    const { project, clip, entry, fragment } = fixture();
    entry.binding = { kind: 'project' };
    fragment.timeDomain = 'result';
    entry.document.fragments.push({ ...fragment, id: 'second', start: 15, end: 16 });
    project.textDocuments!.push({ ...structuredClone(entry), id: 'other-document' });
    clip.startTime = 20;
    clip.playbackRate = 4;
    const context = captureVideoProjectTextRewriteContext(project, entry.id, ['second', 'phrase'], {
      ...options,
      wholeDocument: true,
      mode: 'script',
      changeIntervals: true,
      resegment: true,
    });
    expect(context.fragments.map(({ id, start, end }) => ({ id, start, end }))).toEqual([
      { id: 'second', start: 15, end: 16 },
      { id: 'phrase', start: 1, end: 9 },
    ]);
    expect(context.window).toEqual({ start: 1, end: 16 });
    expect(() =>
      captureVideoProjectTextRewriteContext(project, entry.id, ['phrase'], {
        ...options,
        wholeDocument: true,
      })
    ).toThrow('stale');
  });

  it.each(['partial', 'excluded', 'whole-document-hidden'] as const)(
    'refuses %s source text without filtering',
    (scenario) => {
      const { project, clip, entry, fragment } = fixture();
      if (scenario === 'partial') clip.sourceDuration = 5;
      else if (scenario === 'excluded') project.clips = [];
      else entry.document.fragments.push({ ...fragment, id: 'dormant', start: 11, end: 12 });
      expect(() =>
        captureVideoProjectTextRewriteContext(
          project,
          entry.id,
          scenario === 'whole-document-hidden' ? ['phrase', 'dormant'] : ['phrase'],
          { ...options, wholeDocument: scenario === 'whole-document-hidden' }
        )
      ).toThrow('stale');
    }
  );

  it('refuses partially excluded project text', () => {
    const { project, entry, fragment } = fixture();
    entry.binding = { kind: 'project' };
    fragment.timeDomain = 'result';
    project.duration = 5;
    expect(() =>
      captureVideoProjectTextRewriteContext(project, entry.id, ['phrase'], options)
    ).toThrow('stale');
  });

  it('refuses missing document or fragment and empty or repeated selections', () => {
    const { project, entry } = fixture();
    expect(() =>
      captureVideoProjectTextRewriteContext(project, 'missing', ['phrase'], options)
    ).toThrow('stale');
    expect(() =>
      captureVideoProjectTextRewriteContext(project, entry.id, ['missing'], options)
    ).toThrow('stale');
    for (const ids of [[], ['phrase', 'phrase']])
      expect(() => captureVideoProjectTextRewriteContext(project, entry.id, ids, options)).toThrow(
        'invalid-request'
      );
  });

  it.each([
    { start: -1, end: 15 },
    { start: 0, end: 31 },
    { start: 4, end: 11 },
    { start: 3, end: 10 },
    { start: 11, end: 3 },
    { start: 0, end: Number.NaN },
  ])('refuses invalid or insufficient project window %j', (window) => {
    const { project, entry } = fixture();
    expect(() =>
      captureVideoProjectTextRewriteContext(project, entry.id, ['phrase'], { ...options, window })
    ).toThrow('invalid-request');
  });

  it('accepts an explicit enclosing project window and rejects invalid permissions', () => {
    const { project, entry } = fixture();
    expect(
      captureVideoProjectTextRewriteContext(project, entry.id, ['phrase'], {
        ...options,
        window: { start: 0, end: 30 },
      }).window
    ).toEqual({ start: 0, end: 30 });
    expect(() =>
      captureVideoProjectTextRewriteContext(project, entry.id, ['phrase'], {
        ...options,
        resegment: true,
      })
    ).toThrow('invalid-request');
  });

  it('retains invalid-request for a non-budget context error without changing project input', () => {
    const { project, entry } = fixture();
    const before = structuredClone(project);
    expect(() =>
      captureVideoProjectTextRewriteContext(project, entry.id, ['phrase'], {
        ...options,
        prompt: '   ',
      })
    ).toThrow(new Error('invalid-request'));
    expect(project).toEqual(before);
  });

  it('refuses output-budget and serialized-context overflow without truncation', () => {
    const { project, clip, entry, fragment } = fixture();
    fragment.text = 'x'.repeat(1_200);
    expect(() =>
      captureVideoProjectTextRewriteContext(project, entry.id, ['phrase'], options)
    ).toThrow('too-large');
    fragment.text = 'Two words';
    clip.sourceInstanceId = clip.id;
    project.clips = Array.from({ length: 1_000 }, (_, index) => ({
      ...clip,
      id: `piece-${index}`,
    }));
    expect(() =>
      captureVideoProjectTextRewriteContext(project, entry.id, ['phrase'], options)
    ).toThrow('too-large');
    expect(project.clips).toHaveLength(1_000);
  });
});
