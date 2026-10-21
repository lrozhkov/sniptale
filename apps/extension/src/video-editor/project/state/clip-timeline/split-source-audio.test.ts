import type { ReviewOriginalSpeech } from '../../../../features/video/review/original-speech';
import { reviewSpeechTextSignature } from '../../../../features/video/review/speech-transcript';
import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../../../../features/video/project/factories/creation';
import { getProjectSourceAudioRanges } from '../../../../features/video/project/source-audio';
import { isExportReadyVideoProject } from '../../../../features/video/project/validation/root';
import { duplicateProjectClipsWithResult, splitProjectClipsAtTimeWithResult } from './split';

function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'source.webm',
    width: 640,
    height: 360,
    duration: 10,
    mimeType: 'video/webm',
    size: 100,
  });
  const clip = project.clips.find((item) => item.type === 'VIDEO');
  if (!clip || clip.type !== 'VIDEO') throw new Error('Missing video source');
  project.version = 28;
  project.sourceAudioDocuments = [
    {
      id: 'envelope',
      binding: {
        kind: 'source',
        assetId: clip.assetId,
        sourceInstanceId: clip.sourceInstanceId ?? clip.id,
      },
      ranges: [{ id: 'manual', start: 2, end: 8, volume: 2 }],
      mutes: [],
    },
  ];
  return { project, clip };
}

it('keeps one legacy source binding across a split without rewriting hidden source ranges', () => {
  const { project, clip } = fixture();
  delete clip.sourceInstanceId;
  project.sourceAudioDocuments![0]!.binding.sourceInstanceId = clip.id;
  const before = structuredClone(project);
  const result = splitProjectClipsAtTimeWithResult(project, clip.id, 5);
  expect(result).not.toBeNull();
  if (!result) throw new Error('Expected source split');
  const parts = result.project.clips.filter((item) => item.type === 'VIDEO');
  expect(parts.map((part) => part.sourceInstanceId)).toEqual([clip.id, clip.id]);
  expect(parts.map((part) => getProjectSourceAudioRanges(result.project, part))).toEqual([
    [{ start: 2, end: 5, volume: 2 }],
    [{ start: 5, end: 8, volume: 2 }],
  ]);
  expect(result.project.sourceAudioDocuments).toEqual(project.sourceAudioDocuments);
  expect(isExportReadyVideoProject(result.project)).toBe(true);
  expect(project).toEqual(before);
});

it('duplicates the complete source envelope into an independent insertion', () => {
  const { project, clip } = fixture();
  const before = structuredClone(project);
  const result = duplicateProjectClipsWithResult(project, clip.id);
  expect(result).not.toBeNull();
  if (!result) throw new Error('Expected source copy');
  expect(result.project.sourceAudioDocuments).toHaveLength(2);
  const copy = result.project.sourceAudioDocuments![1]!;
  expect(copy.id).not.toBe('envelope');
  expect(copy.binding.sourceInstanceId).not.toBe(
    project.sourceAudioDocuments![0]!.binding.sourceInstanceId
  );
  expect(copy.ranges).toEqual(project.sourceAudioDocuments![0]!.ranges);
  copy.ranges[0]!.volume = 0;
  expect(project).toEqual(before);
  expect(isExportReadyVideoProject(result.project)).toBe(true);
});

it('refuses document duplication above the aggregate budget without partial clips', () => {
  const { project, clip } = fixture();
  const template = project.sourceAudioDocuments![0]!;
  project.sourceAudioDocuments = Array.from({ length: 10 }, (_, index) => ({
    ...template,
    id: String(index),
    binding: {
      ...template.binding,
      sourceInstanceId: index === 0 ? template.binding.sourceInstanceId : String(index),
    },
    ranges: Array.from({ length: 500 }, (_, i) => ({
      id: String(i),
      start: i / 100,
      end: (i + 0.5) / 100,
      volume: 1,
    })),
  }));
  const before = structuredClone(project);
  expect(duplicateProjectClipsWithResult(project, clip.id)).toBeNull();
  expect(project).toEqual(before);
});

function passiveSourceSpeech(assetId: string): ReviewOriginalSpeech {
  const profile = { modelId: 'tts', voiceId: 'voice', responseFormat: 'wav' as const };
  return {
    enabled: false,
    transcript: {
      version: 1,
      profile,
      transcriptionModelId: 'recognition-model',
      phrases: [
        {
          id: 'phrase',
          start: 1,
          end: 3,
          originalText: 'Original',
          text: 'Draft',
          revision: 2,
          alignment: 'word',
          words: [{ text: 'Original', start: 1, end: 3 }],
        },
      ],
      replacements: [
        {
          id: 'historical',
          phraseId: 'removed-phrase',
          start: 1,
          end: 3,
          duration: 1,
          assetId,
          revision: 1,
          text: 'Accepted',
          profile,
          textSignature: reviewSpeechTextSignature('Accepted', profile),
          enabled: true,
          originalVolume: 0.25,
        },
      ],
    },
  };
}

it('retains passive speech through real legacy split and independent source copy commands', () => {
  const { project, clip } = fixture();
  const source = project.assets.find((asset) => asset.id === clip.assetId)!;
  const replacement = {
    ...structuredClone(source),
    id: 'project-asset:passive-history',
    type: 'AUDIO' as const,
    source: { kind: 'project-asset' as const, projectAssetId: 'history-private' },
    metadata: { ...source.metadata, width: 0, height: 0, mimeType: 'audio/wav', hasAudio: true },
  };
  delete replacement.recordingPart;
  project.assets.push(replacement);
  project.version = 31;
  const document = project.sourceAudioDocuments![0]!;
  document.speech = passiveSourceSpeech(replacement.id);
  delete clip.sourceInstanceId;
  document.binding.sourceInstanceId = clip.id;
  expect(isExportReadyVideoProject(project)).toBe(true);
  const before = structuredClone(project);
  const split = splitProjectClipsAtTimeWithResult(project, clip.id, 5);
  if (!split) throw new Error('Expected split');
  expect(split.project.sourceAudioDocuments).toEqual([document]);
  expect(
    split.project.clips.filter((item) => item.type === 'VIDEO').map((item) => item.sourceInstanceId)
  ).toEqual([clip.id, clip.id]);
  expect(isExportReadyVideoProject(split.project)).toBe(true);
  const copied = duplicateProjectClipsWithResult(project, clip.id);
  if (!copied) throw new Error('Expected source copy');
  expect(copied.project.sourceAudioDocuments).toHaveLength(2);
  const copy = copied.project.sourceAudioDocuments![1]!;
  expect(copy.binding.sourceInstanceId).not.toBe(document.binding.sourceInstanceId);
  expect(copy.speech).toEqual(document.speech);
  expect(copy.speech).not.toBe(document.speech);
  expect(copy.speech!.transcript.replacements).not.toBe(document.speech.transcript.replacements);
  expect(copied.project.assets).toEqual(project.assets);
  expect(isExportReadyVideoProject(copied.project)).toBe(true);
  copy.speech!.transcript.phrases[0]!.text = 'Independent draft';
  copy.speech!.transcript.replacements[0]!.originalVolume = 1;
  expect(project).toEqual(before);
});
