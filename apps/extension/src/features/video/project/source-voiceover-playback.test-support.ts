import {
  createVideoProjectFromRecording,
  createVideoProjectTrack,
  createVideoProjectAsset,
} from './factories/creation';
import { createAudioClipFromAsset } from './factories/clip';
import { buildReviewTimeMap } from '../review/timeline';
import { anchorReviewVoiceoverAtSource } from '../review/voiceover-edits';
import type { VideoProjectSourceVoiceoverDocument } from './source-voiceover';

export function sourceVoiceoverPlaybackFixture(tempo = 1) {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'Source.webm',
    width: 640,
    height: 360,
    duration: 8,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
  });
  const clip = project.clips.find((clip) => clip.type === 'VIDEO');
  if (!clip || clip.type !== 'VIDEO') throw new Error('Missing video');
  const track = createVideoProjectTrack('Voice', 1, 'AUDIO');
  project.tracks.push(track);
  const reference = buildReviewTimeMap(8, []);
  const document: VideoProjectSourceVoiceoverDocument = {
    id: 'document',
    trackId: track.id,
    binding: {
      kind: 'source',
      assetId: clip.assetId,
      sourceInstanceId: clip.sourceInstanceId ?? clip.id,
    },
    enabled: true,
    originalAudioMuteVolume: 0.25,
    reference,
    take: anchorReviewVoiceoverAtSource(
      {
        id: 'take',
        assetId: 'voice',
        timelineStart: 0,
        sourceOffset: 0.37,
        duration: 4,
        volume: 1.5,
        muted: false,
        fadeIn: 0.3,
        fadeOut: 0.6,
        tempo,
      },
      reference
    ),
  };
  project.sourceVoiceoverDocuments = [document];
  return { project, clip, track, document };
}

export function pairedSourceVoiceoverPlaybackFixture() {
  const value = sourceVoiceoverPlaybackFixture();
  const { project, document, clip } = value;
  const sourceAsset = project.assets.find((asset) => asset.id === clip.assetId)!;
  sourceAsset.metadata.hasAudio = true;
  const originalTrack = createVideoProjectTrack('Original sound', 2, 'AUDIO');
  const original = createAudioClipFromAsset(originalTrack.id, sourceAsset);
  original.sourceInstanceId = 'paired-original';
  project.tracks.push(originalTrack);
  project.clips.push(original);
  project.assets.push(
    createVideoProjectAsset(
      'Voice',
      'AUDIO',
      { kind: 'project-asset', projectAssetId: 'voice' },
      {
        width: 0,
        height: 0,
        duration: 8,
        mimeType: 'audio/wav',
        size: 100,
        hasAudio: true,
        audioPeaks: null,
      }
    )
  );
  document.take.assetId = project.assets.at(-1)!.id;
  document.originalAudioSourceInstanceId = original.sourceInstanceId;
  project.version = 31;
  return { ...value, original, originalTrack };
}
