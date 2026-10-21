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
