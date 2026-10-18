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
