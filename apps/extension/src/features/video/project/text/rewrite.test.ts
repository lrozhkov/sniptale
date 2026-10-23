import { describe, expect, it } from 'vitest';
import type { ReviewTextProposal } from '../../../../contracts/ai/review-text';
import { createReviewCaptionSettings } from '../../review/text-document';
import { createVideoClipFromAsset } from '../factories/clip';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../factories/creation';
import { VideoProjectAssetType, VideoTrackKind } from '../types';
import type { VideoProjectTextDocument } from './types';
import {
  applyVideoProjectTextRewrite,
  captureVideoProjectTextRewrite,
  matchesVideoProjectTextRewriteBasis,
} from './rewrite';

const options = {
  prompt: 'Clarify',
  mode: 'phrases' as const,
  wholeDocument: false,
  changeIntervals: false,
  resegment: false,
};
function ids() {
  let next = 0;
  return () => `generated-${++next}`;
}
function fixture() {
  const project = createEmptyVideoProject('Project');
  const asset = createVideoProjectAsset(
    'Source',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'media' },
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
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360, 0);
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  const entry: VideoProjectTextDocument = {
    id: 'text',
    binding: { kind: 'source', assetId: asset.id, sourceInstanceId: clip.id },
    captions: createReviewCaptionSettings(),
    document: {
      version: 1,
      fragments: [
        {
          id: 'one',
          text: 'First',
          originalText: 'First',
          revision: 1,
          timingRevision: 2,
          alignment: 'word',
          start: 1,
          end: 2,
          timeDomain: 'source',
          showInVideo: true,
          words: [{ text: 'First', start: 1, end: 2 }],
          origin: { kind: 'original', start: 1, end: 2 },
        },
        {
          id: 'two',
          text: 'Second',
          originalText: 'Second',
          revision: 0,
          timingRevision: 0,
          alignment: 'range',
          start: 3,
          end: 4,
          timeDomain: 'source',
          showInVideo: true,
          origin: { kind: 'original', start: 3, end: 4 },
        },
      ],
    },
  };
  project.assets = [asset];
  project.clips = [clip];
  project.duration = 30;
  project.textDocuments = [entry];
  const capture = (
    patch: Partial<Parameters<typeof captureVideoProjectTextRewrite>[3]> = {},
    selected = ['one']
  ) => captureVideoProjectTextRewrite(project, entry.id, selected, { ...options, ...patch });
  return { project, asset, clip, entry, capture };
}
const proposal: ReviewTextProposal = {
  version: 1,
  fragments: [{ fromIds: ['one'], text: 'Clear' }],
};

describe('montage text rewrite placement', () => {
  it('deeply detaches capture and refuses changed authored text without mutating its source', () => {
    const { project, entry, capture } = fixture();
    const basis = capture();
    basis.fragments[0]!.words![0]!.text = 'Detached';
    basis.binding = { kind: 'project' };
    basis.context.fragments[0]!.text = 'Detached';
    expect(entry.document.fragments[0]!.words![0]!.text).toBe('First');
    expect(entry.document.fragments[0]!.text).toBe('First');
    expect(matchesVideoProjectTextRewriteBasis(project, basis)).toBe(false);
  });
  it('preserves source clock across cuts, rates, repeated lanes and independent instances', () => {
    const { project, clip, entry, capture } = fixture();
    clip.sourceInstanceId = clip.id;
    const secondTrack = createVideoProjectTrack('Second lane', 1, VideoTrackKind.PRIMARY);
    project.tracks.push(secondTrack);
    project.clips = [
      { ...clip, id: 'cut-a', sourceDuration: 5, duration: 2.5, playbackRate: 2 },
      { ...clip, id: 'cut-b', sourceStart: 5, sourceDuration: 5, duration: 5, startTime: 10 },
      { ...clip, id: 'repeat', trackId: secondTrack.id, startTime: 15 },
    ];
    const other = structuredClone(entry);
    other.id = 'independent';
    other.binding = { kind: 'source', assetId: clip.assetId, sourceInstanceId: 'separate' };
    project.clips.push({ ...clip, id: 'separate', sourceInstanceId: 'separate', startTime: 20 });
    project.textDocuments!.push(other);
    const before = structuredClone(project);
    const result = applyVideoProjectTextRewrite(project, capture(), proposal, 'replace', ids());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.documents[0]!.document.fragments[0]).toMatchObject({
      id: 'one',
      text: 'Clear',
      start: 1,
      end: 2,
      timeDomain: 'source',
      timingRevision: 2,
      origin: entry.document.fragments[0]!.origin,
    });
    expect(result.project.textDocuments![1]).toBe(other);
    expect(result.project.clips).toBe(project.clips);
    expect(result.project.assets).toBe(project.assets);
    expect(project).toEqual(before);
    expect(result.project.version).toBe(5);
  });
  it('keeps fixed variants hidden in their source document and preserves originals', () => {
    const { project, entry, capture } = fixture();
    const result = applyVideoProjectTextRewrite(project, capture(), proposal, 'variant', ids());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]!.binding).toEqual(entry.binding);
    expect(result.documents[0]!.document.fragments.slice(0, 2)).toEqual(entry.document.fragments);
    expect(result.documents[0]!.document.fragments[2]).toMatchObject({
      showInVideo: false,
      timeDomain: 'source',
      variantId: 'generated-1',
    });
  });
  it.each(['replace', 'variant'] as const)(
    'partitions explicit %s timing even for equal numeric endpoints and retains dormant text and captions',
    (mode) => {
      const { project, entry, capture } = fixture();
      entry.document.fragments.push({
        ...entry.document.fragments[1]!,
        id: 'dormant',
        start: 15,
        end: 16,
      });
      const basis = capture({ changeIntervals: true });
      const before = structuredClone(project);
      const result = applyVideoProjectTextRewrite(
        project,
        basis,
        { version: 1, fragments: [{ fromIds: ['one'], text: 'First', start: 1, end: 2 }] },
        mode,
        ids()
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const [source, independent] = result.documents;
      expect(source!.binding).toEqual(entry.binding);
      expect(source!.document.fragments.map(({ id }) => id)).toEqual(
        mode === 'replace' ? ['two', 'dormant'] : ['one', 'two', 'dormant']
      );
      expect(independent!.binding).toEqual({ kind: 'project' });
      expect(independent!.captions).toEqual(entry.captions);
      expect(independent!.document.fragments[0]).toMatchObject({
        timeDomain: 'result',
        start: 1,
        end: 2,
        alignment: 'manual',
        ...(mode === 'variant' ? { showInVideo: false } : { timingRevision: 3 }),
      });
      expect(independent!.document.fragments[0]!.words).toBeUndefined();
      expect(project).toEqual(before);
    }
  );
  it('retains an empty source document after whole-document retiming', () => {
    const { project, capture } = fixture();
    const basis = capture({ wholeDocument: true, changeIntervals: true }, ['one', 'two']);
    const result = applyVideoProjectTextRewrite(
      project,
      basis,
      {
        version: 1,
        fragments: basis.context.fragments.map(({ id, text, start, end }) => ({
          fromIds: [id],
          text,
          start,
          end,
        })),
      },
      'replace',
      ids()
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.documents[0]!.document.fragments).toEqual([]);
  });
  it('resegments a script with complete provenance and independent project placement', () => {
    const { project, entry, capture } = fixture();
    const basis = capture(
      { wholeDocument: true, changeIntervals: true, resegment: true, mode: 'script' },
      ['one', 'two']
    );
    const result = applyVideoProjectTextRewrite(
      project,
      basis,
      { version: 1, fragments: [{ fromIds: ['one', 'two'], text: 'Together', start: 1, end: 4 }] },
      'replace',
      ids()
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.documents[1]!.document.fragments[0]).toMatchObject({
      derivedFrom: ['one', 'two'],
      origins: entry.document.fragments.map(({ origin }) => origin),
      timeDomain: 'result',
    });
  });
  it.each([false, true])(
    'applies project-bound text directly with timing permission %s',
    (changeIntervals) => {
      const { project, entry, capture } = fixture();
      entry.binding = { kind: 'project' };
      entry.document.fragments.forEach((fragment) => {
        fragment.timeDomain = 'result';
      });
      const result = applyVideoProjectTextRewrite(
        project,
        capture({ changeIntervals, window: { start: 0, end: 30 } }),
        {
          version: 1,
          fragments: [
            { fromIds: ['one'], text: 'Clear', ...(changeIntervals ? { start: 5, end: 6 } : {}) },
          ],
        },
        'replace',
        ids()
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.documents).toHaveLength(1);
      expect(result.documents[0]!.document.fragments[0]).toMatchObject({
        start: changeIntervals ? 5 : 1,
        end: changeIntervals ? 6 : 2,
        timeDomain: 'result',
      });
    }
  );
});

describe('montage text rewrite admission', () => {
  it('allows independent appearance changes and returns the original project for a no-op', () => {
    const { project, entry, capture } = fixture();
    const basis = capture();
    entry.document.fragments[0]!.showInVideo = false;
    entry.captions!.enabled = false;
    const result = applyVideoProjectTextRewrite(
      project,
      basis,
      { version: 1, fragments: [{ fromIds: ['one'], text: 'First' }] },
      'replace',
      () => {
        throw new Error('No identity needed');
      }
    );
    expect(result).toEqual({ ok: true, project, changed: false, documents: [] });
    if (result.ok) expect(result.project).toBe(project);
  });
  it.each(['id', 'createdAt', 'binding', 'text', 'revision', 'geometry', 'whole-scope'] as const)(
    'refuses stale %s atomically',
    (change) => {
      const { project, clip, entry, capture } = fixture();
      const basis = capture(
        { wholeDocument: change === 'whole-scope' },
        change === 'whole-scope' ? ['one', 'two'] : ['one']
      );
      if (change === 'id') project.id = 'other';
      else if (change === 'createdAt') project.createdAt++;
      else if (change === 'binding') entry.binding = { kind: 'project' };
      else if (change === 'text') entry.document.fragments[0]!.text = 'Edited';
      else if (change === 'revision') entry.document.fragments[0]!.revision++;
      else if (change === 'geometry') clip.startTime++;
      else entry.document.fragments.push({ ...entry.document.fragments[1]!, id: 'extra' });
      const before = structuredClone(project);
      expect(applyVideoProjectTextRewrite(project, basis, proposal, 'replace', ids())).toEqual({
        ok: false,
        reason: 'stale',
      });
      expect(project).toEqual(before);
    }
  );
  it.each([
    { version: 1, fragments: [{ fromIds: ['unknown'], text: 'Wrong' }] },
    { version: 1, fragments: [{ fromIds: ['one'], text: 'Wrong', start: 1, end: 2 }] },
    { version: 1, fragments: [] },
  ] satisfies ReviewTextProposal[])(
    'refuses invalid proposal or undisclosed permission %j',
    (value) => {
      const { project, capture } = fixture();
      const before = structuredClone(project);
      expect(applyVideoProjectTextRewrite(project, capture(), value, 'replace', ids())).toEqual({
        ok: false,
        reason: 'invalid',
      });
      expect(project).toEqual(before);
    }
  );
  it('refuses generated fragment and document identity collisions', () => {
    const { project, entry, capture } = fixture();
    expect(
      applyVideoProjectTextRewrite(project, capture(), proposal, 'variant', () => 'one')
    ).toEqual({ ok: false, reason: 'invalid' });
    expect(
      applyVideoProjectTextRewrite(
        project,
        capture({ changeIntervals: true }),
        { version: 1, fragments: [{ fromIds: ['one'], text: 'Clear', start: 1, end: 2 }] },
        'replace',
        () => entry.id
      )
    ).toEqual({ ok: false, reason: 'invalid' });
  });
  it('refuses aggregate fragment overflow and invalid source references atomically', () => {
    const { project, entry, capture } = fixture();
    project.textDocuments!.push({
      id: 'large',
      binding: { kind: 'project' },
      document: {
        version: 1,
        fragments: Array.from({ length: 1998 }, (_, index) => ({
          ...entry.document.fragments[0]!,
          id: `many-${index}`,
          timeDomain: 'result',
        })),
      },
    });
    const basis = capture();
    const before = structuredClone(project);
    expect(applyVideoProjectTextRewrite(project, basis, proposal, 'variant', ids())).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(project).toEqual(before);
    project.textDocuments!.pop();
    project.textDocuments!.push({
      ...structuredClone(entry),
      id: 'bad-reference',
      binding: { kind: 'source', assetId: 'missing', sourceInstanceId: 'missing' },
    });
    expect(applyVideoProjectTextRewrite(project, basis, proposal, 'replace', ids())).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });
});
