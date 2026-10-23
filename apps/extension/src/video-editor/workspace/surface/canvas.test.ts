// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import {
  createVideoProjectAsset,
  createVideoProjectTrack,
  createVideoProjectFromRecording,
} from '../../../features/video/project/factories/creation';
import { buildReviewTimeMap } from '../../../features/video/review/timeline';
import { projectSourceVoiceoverViews } from '../../../features/video/project/source-voiceover-views';
import { isExportReadyVideoProject } from '../../../features/video/project/validation/root';
import { revealWorkspaceMaterial } from './canvas';

function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'Source',
    width: 640,
    height: 360,
    duration: 8,
    mimeType: 'video/webm',
    size: 1,
    hasAudio: false,
  });
  const source = project.clips.find((clip) => clip.type === 'VIDEO')!;
  if (source.type !== 'VIDEO') throw new Error('Missing source');
  source.sourceInstanceId = 'instance';
  source.duration = 4;
  source.sourceDuration = 4;
  project.clips.push({ ...source, id: 'second', startTime: 20, sourceStart: 4 });
  project.duration = 24;
  project.version = 31;
  const audio = createVideoProjectAsset(
    'Voice',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'voice' },
    {
      width: 0,
      height: 0,
      duration: 8,
      mimeType: 'audio/wav',
      size: 1,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const track = createVideoProjectTrack('Voice', 2, 'AUDIO');
  project.tracks.push(track);
  project.assets.push(audio);
  project.sourceVoiceoverDocuments = [
    {
      id: 'doc',
      trackId: track.id,
      enabled: false,
      binding: { kind: 'source', assetId: source.assetId, sourceInstanceId: 'instance' },
      reference: buildReviewTimeMap(8, []),
      take: {
        id: 'take',
        assetId: audio.id,
        timelineStart: 0,
        sourceOffset: 0,
        duration: 8,
        volume: 1,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
        sourceAnchor: [{ start: 0, end: 8, offset: 0, duration: 8 }],
      },
    },
  ];
  expect(isExportReadyVideoProject(project)).toBe(true);
  const preview = {
    project,
    selection: {
      selectedClipId: null,
      selectedEffectInstanceId: null,
      selectedActionOccurrence: null,
      selectedMotionRegion: null,
      placementMode: null,
      onSelectSourceVoiceover: vi.fn(),
      onSelectClip: vi.fn(),
      onSelectScene: vi.fn(),
    },
    transport: {
      currentTime: 0,
      isPlaying: false,
      playbackRange: null,
      onPausePlayback: vi.fn(() => 22),
      onSeek: vi.fn(),
      onTogglePlay: vi.fn(),
      registerPreviewRuntime: vi.fn(),
    },
  } satisfies Parameters<typeof revealWorkspaceMaterial>[1];
  return { preview, reveal: vi.fn(), source };
}
it('selects the exact whole document and seeks the nearest occurrence using the returned pause time', () => {
  const { preview, reveal } = fixture();
  const before = structuredClone(preview.project);
  const views = projectSourceVoiceoverViews(
    preview.project,
    preview.project.sourceVoiceoverDocuments![0]!
  );
  const use = { kind: 'source-voiceover' as const, assetId: 'audio', documentId: 'doc' };
  revealWorkspaceMaterial(use, preview, reveal, 22);
  expect(preview.selection.onSelectSourceVoiceover).toHaveBeenCalledExactlyOnceWith('doc');
  expect(preview.selection.onSelectClip).not.toHaveBeenCalled();
  expect(preview.transport.onSeek).toHaveBeenCalledExactlyOnceWith(20);
  expect(reveal).toHaveBeenCalledExactlyOnceWith({
    kind: 'source-voiceover',
    documentId: 'doc',
    viewId: views[1]!.clip.id,
  });
  revealWorkspaceMaterial(use, preview, reveal, 22);
  expect(reveal).toHaveBeenCalledTimes(2);
  expect(preview.project).toEqual(before);
});
it('opens a dormant document without seek and ignores a missing identity', () => {
  const { preview, reveal } = fixture();
  preview.project.sourceVoiceoverDocuments![0]!.take.dormant = true;
  revealWorkspaceMaterial(
    { kind: 'source-voiceover', assetId: 'audio', documentId: 'doc' },
    preview,
    reveal,
    22
  );
  expect(preview.selection.onSelectSourceVoiceover).toHaveBeenCalledExactlyOnceWith('doc');
  revealWorkspaceMaterial(
    { kind: 'source-voiceover', assetId: 'audio', documentId: 'missing' },
    preview,
    reveal,
    22
  );
  expect(preview.selection.onSelectSourceVoiceover).toHaveBeenCalledTimes(1);
  expect(preview.transport.onSeek).not.toHaveBeenCalled();
  expect(reveal).not.toHaveBeenCalled();
});
it('retains clip navigation as a distinct typed destination', () => {
  const { preview, reveal, source } = fixture();
  revealWorkspaceMaterial(
    { kind: 'clip', assetId: source.assetId, clipId: source.id },
    preview,
    reveal,
    22
  );
  expect(preview.selection.onSelectClip).toHaveBeenCalledExactlyOnceWith(source.id);
  expect(preview.transport.onSeek).toHaveBeenCalledExactlyOnceWith(source.startTime);
  expect(reveal).toHaveBeenCalledExactlyOnceWith({ kind: 'clip', clipId: source.id });
});

it('opens retained cut settings without a fabricated seek and navigates an existing edge exactly', () => {
  const { preview, reveal, source } = fixture();
  const sourceRange = { assetId: source.assetId, sourceInstanceId: 'instance', start: 1, end: 2 };
  preview.project.compositionJoins = [{ id: 'retained-cut', sampling: 'cut', sourceRange }];
  const use = {
    kind: 'composition-join' as const,
    assetId: source.assetId,
    joinId: 'retained-cut',
  };
  revealWorkspaceMaterial(use, preview, reveal, 22);
  expect(preview.selection.onSelectScene).toHaveBeenCalledOnce();
  expect(preview.transport.onSeek).not.toHaveBeenCalled();
  expect(reveal).not.toHaveBeenCalled();
  preview.project.compositionJoins = [
    { id: 'retained-cut', sampling: 'cut', sourceRange, clipId: source.id, edge: 'end' },
  ];
  revealWorkspaceMaterial(use, preview, reveal, 22);
  expect(preview.transport.onSeek).toHaveBeenCalledExactlyOnceWith(
    source.startTime + source.duration
  );
  expect(reveal).toHaveBeenCalledExactlyOnceWith({ kind: 'clip', clipId: source.id });
});
