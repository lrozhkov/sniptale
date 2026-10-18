import { expect, it } from 'vitest';
import { createEmptyVideoProject, createVideoProjectAsset } from '../factories/creation';
import { createVideoClipFromAsset } from '../factories/clip';
import { editReviewTextFragment } from '../../review/text-document';
import {
  applyVideoProjectTextEdit,
  addVideoProjectManualText,
  videoProjectTextPlayhead,
} from './authoring';

function fixture() {
  const project = createEmptyVideoProject('Text');
  const added = addVideoProjectManualText(project, {
    documentId: 'doc',
    fragmentId: 'phrase',
    start: 1,
  });
  if (!added.ok) throw new Error('Text creation failed');
  return added;
}
it('creates independent text with shared defaults and edits without touching source data', () => {
  const { project, entry } = fixture();
  expect(entry.binding).toEqual({ kind: 'project' });
  expect(entry.captions?.enabled).toBe(false);
  expect(entry.document.fragments[0]).toMatchObject({ start: 1, end: 4, timeDomain: 'result' });
  const result = editReviewTextFragment(entry.document, 'phrase', { text: 'Authored' });
  if (!result.ok) throw new Error('Edit failed');
  const edit = applyVideoProjectTextEdit(project, entry, { document: result.document });
  expect(edit.ok).toBe(true);
  expect(project.textDocuments![0]!.document.fragments[0]!.text).toBe('');
  if (edit.ok) {
    expect(edit.project.version).toBe(5);
    expect(edit.entry.document.fragments[0]).toMatchObject({ text: 'Authored', revision: 1 });
  }
});
it('refuses a removed or recreated document basis and accepts an explicit retry with the current basis', () => {
  const { project, entry } = fixture();
  const recreated = { ...project, textDocuments: [structuredClone(entry)] };
  expect(applyVideoProjectTextEdit(recreated, entry, {})).toEqual({ ok: false, reason: 'stale' });
  expect(
    addVideoProjectManualText(
      { ...project, textDocuments: [] },
      {
        documentId: 'doc',
        fragmentId: 'next',
        start: 2,
        target: entry,
      }
    )
  ).toEqual({ ok: false, reason: 'stale' });
  const retry = addVideoProjectManualText(recreated, {
    documentId: 'unused',
    fragmentId: 'next',
    start: 4,
    target: recreated.textDocuments[0]!,
  });
  expect(retry.ok && retry.entry.document.fragments.map((fragment) => fragment.id)).toEqual([
    'phrase',
    'next',
  ]);
});
it('rejects a complete edit or add above aggregate budget without losing admitted content', () => {
  const { project, entry } = fixture();
  const fragments = Array.from({ length: 2_000 }, (_, index) => ({
    ...entry.document.fragments[0]!,
    id: `text-${index}`,
  }));
  const full = { ...entry, document: { ...entry.document, fragments } };
  project.textDocuments = [full];
  expect(
    addVideoProjectManualText(project, { documentId: 'next', fragmentId: 'new', start: 0 })
  ).toEqual({ ok: false, reason: 'invalid' });
  expect(
    applyVideoProjectTextEdit(project, full, {
      document: {
        ...full.document,
        fragments: [...fragments, { ...fragments[0]!, id: 'overflow' }],
      },
    })
  ).toEqual({ ok: false, reason: 'invalid' });
  expect(full.document.fragments).toHaveLength(2_000);
});
it('does not guess native time in gaps or conflicting placements and respects source speed', () => {
  const { project, entry } = fixture();
  const asset = createVideoProjectAsset(
    'Source',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'asset' },
    {
      duration: 10,
      width: 640,
      height: 360,
      hasAudio: false,
      mimeType: 'video/mp4',
      size: 1,
      audioPeaks: null,
    }
  );
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360, 2);
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  const source = {
    ...entry,
    binding: { kind: 'source' as const, assetId: asset.id, sourceInstanceId: clip.id },
  };
  project.clips = [{ ...clip, sourceStart: 3, sourceDuration: 4, duration: 2, playbackRate: 2 }];
  expect(videoProjectTextPlayhead(project, source, 2.5)).toBe(4);
  expect(videoProjectTextPlayhead(project, source, 4)).toBeNull();
  project.clips.push({
    ...clip,
    duration: 2,
    sourceDuration: 4,
    playbackRate: 2,
    id: 'second',
    sourceInstanceId: clip.id,
    sourceStart: 5,
  });
  expect(videoProjectTextPlayhead(project, source, 2.5)).toBeNull();
  expect(videoProjectTextPlayhead(project, entry, 8)).toBe(8);
  expect(
    addVideoProjectManualText(project, {
      documentId: 'new',
      fragmentId: 'new',
      start: 1,
      target: source,
    })
  ).toEqual({ ok: false, reason: 'stale' });
});
