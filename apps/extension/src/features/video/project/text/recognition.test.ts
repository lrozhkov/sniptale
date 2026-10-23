import { expect, it } from 'vitest';
import { createEmptyVideoProject, createVideoProjectAsset } from '../factories/creation';
import { createVideoClipFromAsset } from '../factories/clip';
import { createReviewCaptionSettings } from '../../review/text-document';
import type { VideoProjectTextDocument } from './types';
import { applyVideoProjectRecognition } from './recognition';
import { projectVideoProjectTextFragment } from './projection';

function fixture() {
  const project = createEmptyVideoProject('Recognition');
  const asset = createVideoProjectAsset(
    'Source',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'bytes' },
    {
      width: 640,
      height: 360,
      duration: 20,
      mimeType: 'video/webm',
      size: 1,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const media = createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360, 4);
  if (media.type !== 'VIDEO') throw new Error('Expected video');
  const clip = { ...media, sourceStart: 2, sourceDuration: 8, duration: 4, playbackRate: 2 };
  project.assets = [asset];
  project.clips = [
    clip,
    { ...clip, id: 'duplicate', sourceInstanceId: 'independent', startTime: 20 },
  ];
  const entry: VideoProjectTextDocument = {
    id: 'recognized',
    binding: { kind: 'source', assetId: asset.id, sourceInstanceId: clip.id },
    captions: createReviewCaptionSettings(),
    document: {
      version: 1,
      fragments: [
        {
          id: 'phrase',
          text: 'Hello.',
          originalText: 'Hello.',
          start: 4,
          end: 6,
          revision: 0,
          timingRevision: 0,
          alignment: 'range',
          timeDomain: 'source',
          showInVideo: true,
          variantId: 'recognition',
          origin: { kind: 'original', start: 4, end: 6 },
        },
      ],
    },
  };
  return { project, entry };
}
it('binds native text to one source instance and projects trimmed rate without changing media', () => {
  const { project, entry } = fixture();
  const applied = applyVideoProjectRecognition(project, entry, { start: 2, end: 10 }, 'add');
  expect(applied?.clips).toBe(project.clips);
  expect(applied?.assets).toBe(project.assets);
  expect(project.textDocuments).toBeUndefined();
  if (!applied) throw new Error('Apply refused');
  const saved = applied.textDocuments![0]!;
  expect(
    projectVideoProjectTextFragment(applied, saved, saved.document.fragments[0]!).ranges
  ).toEqual([{ start: 5, end: 6 }]);
});
it('replaces only recognized fragments within the selected native range of the same instance', () => {
  const { project, entry } = fixture();
  const phrase = entry.document.fragments[0]!;
  const { variantId: _variantId, ...manual } = phrase;
  project.textDocuments = [
    {
      ...entry,
      id: 'old',
      document: {
        version: 1,
        fragments: [
          phrase,
          { ...manual, id: 'manual' },
          {
            ...phrase,
            id: 'outside',
            start: 11,
            end: 12,
            origin: { kind: 'original', start: 11, end: 12 },
          },
        ],
      },
    },
    {
      ...entry,
      id: 'other',
      binding: {
        ...entry.binding,
        kind: 'source',
        assetId: project.assets[0]!.id,
        sourceInstanceId: 'independent',
      },
    },
  ];
  const applied = applyVideoProjectRecognition(project, entry, { start: 2, end: 10 }, 'replace');
  expect(applied?.textDocuments?.[0]?.document.fragments.map((fragment) => fragment.id)).toEqual([
    'manual',
    'outside',
  ]);
  expect(applied?.textDocuments?.[1]?.document.fragments).toEqual([phrase]);
  expect(applied?.textDocuments).toHaveLength(3);
});
it('refuses duplicate identities, invalid clocks, missing sources and aggregate overflow atomically', () => {
  const { project, entry } = fixture();
  expect(
    applyVideoProjectRecognition({ ...project, clips: [] }, entry, { start: 2, end: 10 }, 'add')
  ).toBeNull();
  expect(applyVideoProjectRecognition(project, entry, { start: 5, end: 10 }, 'add')).toBeNull();
  expect(
    applyVideoProjectRecognition(
      project,
      { ...entry, binding: { kind: 'project' } },
      { start: 2, end: 10 },
      'add'
    )
  ).toBeNull();
  project.textDocuments = [entry];
  expect(applyVideoProjectRecognition(project, entry, { start: 2, end: 10 }, 'add')).toBeNull();
  const full = {
    ...entry,
    id: 'full',
    document: {
      ...entry.document,
      fragments: Array.from({ length: 2_000 }, (_, index) => ({
        ...entry.document.fragments[0]!,
        id: `phrase-${index}`,
      })),
    },
  };
  project.textDocuments = [full];
  expect(applyVideoProjectRecognition(project, entry, { start: 2, end: 10 }, 'add')).toBeNull();
  expect(project.textDocuments).toEqual([full]);
});
