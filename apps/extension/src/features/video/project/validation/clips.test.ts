import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../factories/creation';
import { createAudioClipFromAsset } from '../factories/clip';
import { isVideoProjectClip } from './clips';

it('validates source instance identity for audio as well as video clips', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'clip.webm',
    width: 640,
    height: 360,
    duration: 10,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: true,
  });
  const video = project.clips.find((clip) => clip.type === 'VIDEO');
  if (!video) throw new Error('Missing video');
  const audio = createAudioClipFromAsset('audio-track', project.assets[0]!);
  for (const clip of [video, audio]) {
    if (clip.type !== 'VIDEO' && clip.type !== 'AUDIO') continue;
    expect(isVideoProjectClip({ ...clip, sourceInstanceId: undefined })).toBe(true);
    expect(isVideoProjectClip({ ...clip, sourceInstanceId: 'instance' })).toBe(true);
    expect(isVideoProjectClip({ ...clip, sourceInstanceId: 1 })).toBe(false);
  }
});

it('admits bounded audio-only original bindings and refuses malformed or self targets', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'clip.webm',
    width: 640,
    height: 360,
    duration: 10,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: true,
  });
  const audio = createAudioClipFromAsset('audio-track', project.assets[0]!);
  const target = { assetId: audio.assetId, sourceInstanceId: 'other-instance' };
  const valid = { volume: 0.25, targets: [target] };
  expect(isVideoProjectClip({ ...audio, originalAudioMute: valid })).toBe(true);
  expect(
    isVideoProjectClip({
      ...project.clips.find((clip) => clip.type === 'VIDEO'),
      originalAudioMute: valid,
    })
  ).toBe(false);
  for (const invalid of [
    null,
    {},
    { ...valid, volume: -1 },
    { ...valid, volume: 1.01 },
    { ...valid, volume: NaN },
    { ...valid, targets: [] },
    { ...valid, targets: [target, target] },
    { ...valid, targets: [{ ...target, sourceInstanceId: audio.id }] },
    { ...valid, extra: true },
    { ...valid, targets: [{ ...target, assetId: '' }] },
    { ...valid, targets: [{ ...target, assetId: ' padded' }] },
    { ...valid, targets: [{ ...target, assetId: 'x'.repeat(257) }] },
    { ...valid, targets: [{ ...target, extra: true }] },
    {
      ...valid,
      targets: Array.from({ length: 513 }, (_, index) => ({
        ...target,
        sourceInstanceId: `target-${index}`,
      })),
    },
  ]) {
    expect(isVideoProjectClip({ ...audio, originalAudioMute: invalid })).toBe(false);
  }
  expect(
    isVideoProjectClip({
      ...audio,
      originalAudioMute: {
        volume: 0,
        targets: Array.from({ length: 512 }, (_, index) => ({
          ...target,
          sourceInstanceId: `target-${index}`,
        })),
      },
    })
  ).toBe(true);
});
