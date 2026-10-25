import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../factories/creation';
import { createAudioClipFromAsset } from '../factories/clip';
import { isVideoProjectClip } from './clips';
import { reviewSpeechTextSignature } from '../../review/speech-transcript';

it('accepts camera split sides only on video clips', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'clip.webm',
    width: 640,
    height: 360,
    duration: 10,
    mimeType: 'video/webm',
    size: 100,
  });
  const video = project.clips.find((clip) => clip.type === 'VIDEO');
  if (!video || video.type !== 'VIDEO') throw new Error('Missing video');
  expect(isVideoProjectClip({ ...video, cameraSplit: 'left' })).toBe(true);
  expect(isVideoProjectClip({ ...video, cameraSplit: 'diagonal' })).toBe(false);
  expect(isVideoProjectClip({ ...video, cameraSplit: null })).toBe(false);
  const audio = createAudioClipFromAsset('audio-track', project.assets[0]!);
  expect(isVideoProjectClip({ ...audio, cameraSplit: 'left' })).toBe(false);
  for (const cameraScreenBehavior of ['shrink', 'shift', 'overlay']) {
    expect(isVideoProjectClip({ ...video, cameraScreenBehavior })).toBe(true);
    expect(isVideoProjectClip({ ...audio, cameraScreenBehavior })).toBe(false);
  }
  expect(isVideoProjectClip({ ...video, cameraScreenBehavior: 'unknown' })).toBe(false);
  expect(isVideoProjectClip({ ...video, cameraScreenBehavior: null })).toBe(false);
});

it('validates timed split positions and retained camera layout without normalizing data', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'clip.webm',
    width: 640,
    height: 360,
    duration: 10,
    mimeType: 'video/webm',
    size: 100,
  });
  const video = project.clips.find((clip) => clip.type === 'VIDEO');
  if (!video || video.type !== 'VIDEO') throw new Error('Missing video');
  const position = {
    id: 'split',
    sourceTime: 1,
    transform: video.transform,
    fitMode: video.fitMode,
    transition: { kind: 'smooth', duration: 0.5 },
    cameraSplit: 'right',
  };
  expect(isVideoProjectClip({ ...video, cameraPositions: [position] })).toBe(true);
  expect(
    isVideoProjectClip({
      ...video,
      cameraPositions: [{ ...position, cameraScreenBehavior: 'shift' }],
    })
  ).toBe(true);
  expect(
    isVideoProjectClip({
      ...video,
      cameraPositions: [{ ...position, cameraScreenBehavior: 'unknown' }],
    })
  ).toBe(false);
  expect(
    isVideoProjectClip({ ...video, cameraPositions: [{ ...position, cameraSplit: null }] })
  ).toBe(true);
  expect(
    isVideoProjectClip({ ...video, cameraPositions: [{ ...position, cameraSplit: 'diagonal' }] })
  ).toBe(false);
});

it('retains valid speech history and rejects fields that would be silently discarded', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'clip.webm',
    width: 640,
    height: 360,
    duration: 10,
    mimeType: 'video/webm',
    size: 100,
  });
  const audio = createAudioClipFromAsset('audio-track', project.assets[0]!);
  const profile = { modelId: 'tts', voiceId: 'voice', responseFormat: 'wav' as const };
  const phrase = {
    id: 'phrase',
    start: 1,
    end: 2,
    text: 'Hello',
    originalText: 'Hello',
    revision: 0,
    alignment: 'word',
    words: [{ text: 'Hello', start: 1, end: 2 }],
  };
  const replacement = {
    id: 'take',
    start: 1,
    end: 2,
    duration: 0.5,
    assetId: 'project-asset:take',
    phraseId: 'phrase',
    revision: 0,
    text: 'Hello',
    profile,
    textSignature: reviewSpeechTextSignature('Hello', profile),
  };
  const transcript = { version: 1, phrases: [phrase], replacements: [replacement], profile };
  expect(isVideoProjectClip({ ...audio, transcript })).toBe(true);
  expect(isVideoProjectClip({ ...audio, transcript: { ...transcript, extra: true } })).toBe(false);
  expect(
    isVideoProjectClip({
      ...audio,
      transcript: { ...transcript, phrases: [{ ...phrase, extra: true }] },
    })
  ).toBe(false);
  expect(
    isVideoProjectClip({
      ...audio,
      transcript: { ...transcript, replacements: [{ ...replacement, extra: true }] },
    })
  ).toBe(false);
});

it('admits bounded playback windows and phases on a video clip', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'clip.webm',
    width: 640,
    height: 360,
    duration: 10,
    mimeType: 'video/webm',
    size: 100,
  });
  const video = project.clips.find((clip) => clip.type === 'VIDEO');
  if (!video || video.type !== 'VIDEO') throw new Error('Missing video');
  const playbackWindow = {
    offset: 0,
    extent: 12,
    holdAt: 9,
    fadePhase: { offset: 0, duration: 1 },
    gainPhase: { offset: 1, duration: 2 },
  };
  expect(isVideoProjectClip({ ...video, playbackWindow })).toBe(true);
  expect(isVideoProjectClip({ ...video, playbackWindow: { ...playbackWindow, extent: 8 } })).toBe(
    false
  );
  expect(isVideoProjectClip({ ...video, playbackWindow: { ...playbackWindow, extra: true } })).toBe(
    false
  );
});

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

it('admits duration policy only on audio clips', () => {
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
  const video = project.clips.find((clip) => clip.type === 'VIDEO')!;
  const audio = createAudioClipFromAsset('audio-track', project.assets[0]!);
  for (const durationMode of ['project', 'content']) {
    expect(isVideoProjectClip({ ...audio, durationMode })).toBe(true);
    expect(isVideoProjectClip({ ...video, durationMode })).toBe(false);
  }
  for (const durationMode of [null, 'invalid', 1, {}, false])
    expect(isVideoProjectClip({ ...audio, durationMode })).toBe(false);
  expect(isVideoProjectClip(audio)).toBe(true);
});
