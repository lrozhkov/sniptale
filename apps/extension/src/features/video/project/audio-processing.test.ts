import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from './factories/creation';
import { createAudioEffectInstance } from '../audio/effects/catalog';
import {
  getProjectAudioProcessingSelection,
  updateProjectAudioProcessing,
} from './audio-processing';

const processing = () => ({
  version: 1 as const,
  bypassed: false,
  effects: [createAudioEffectInstance('eq', 'b1b80118-71a9-4e59-89d2-a95ba0139aa1')],
});
function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'Source.mp4',
    width: 640,
    height: 360,
    duration: 4,
    mimeType: 'video/mp4',
    size: 100,
    hasAudio: true,
  });
  const video = project.clips.find((clip) => clip.type === 'VIDEO')!;
  const audio = project.clips.find((clip) => clip.type === 'AUDIO')!;
  return { project, video, audio, id: () => 'a7b3b310-1256-455b-80ee-f506e5144797' };
}
it('routes linked video selection to its actual audio owner and retains source values', () => {
  const f = fixture(),
    before = structuredClone(f.project),
    value = processing();
  const target = { kind: 'clip' as const, clipId: f.video.id };
  expect(getProjectAudioProcessingSelection(f.project, target).clipIds).toEqual([f.audio.id]);
  const result = updateProjectAudioProcessing(f.project, target, value, f.id);
  if (!result.ok) throw new Error(result.reason);
  expect(result.project.version).toBe(53);
  expect(result.project.clips.find((clip) => clip.id === f.video.id)).not.toHaveProperty(
    'audioProcessing'
  );
  const next = result.project.clips.find((clip) => clip.id === f.audio.id)!;
  expect(next).toHaveProperty('audioProcessing', value);
  expect(f.project).toEqual(before);
  value.effects[0]!.wet = 0.2;
  expect(next).toHaveProperty('audioProcessing.effects.0.wet', 1);
  expect(getProjectAudioProcessingSelection(result.project, target).editable).toBe(true);
});
it('materializes independent source-placement chains, detects mixed values and clears without schema downgrade', () => {
  const f = fixture();
  f.audio.sourceInstanceId ??= f.audio.id;
  f.project.clips.push({ ...structuredClone(f.audio), id: 'second', startTime: 5 });
  f.project.duration = 9;
  const target = {
    kind: 'source' as const,
    assetId: f.audio.assetId!,
    sourceInstanceId: f.audio.sourceInstanceId ?? f.audio.id,
  };
  const value = processing();
  const result = updateProjectAudioProcessing(f.project, target, value, f.id);
  if (!result.ok) throw new Error(result.reason);
  const state = getProjectAudioProcessingSelection(result.project, target);
  expect(state.clipIds).toHaveLength(2);
  expect(state.mixed).toBe(false);
  const second = result.project.clips.find((clip) => clip.id === 'second');
  expect(second).toHaveProperty('audioProcessing.effects.0.id', f.id());
  expect(second).not.toHaveProperty('audioProcessing.effects.0.id', value.effects[0]!.id);
  if (!second || second.type !== 'AUDIO' || !second.audioProcessing)
    throw new Error('Missing processed placement');
  second.audioProcessing.effects[0]!.wet = 0.2;
  expect(getProjectAudioProcessingSelection(result.project, target).mixed).toBe(true);
  expect(state.value?.effects[0]!.wet).toBe(1);
  const cleared = updateProjectAudioProcessing(result.project, target, undefined, f.id);
  if (!cleared.ok) throw new Error(cleared.reason);
  expect(cleared.project.version).toBe(53);
  for (const clip of cleared.project.clips) expect(clip).not.toHaveProperty('audioProcessing');
});
it('refuses the complete batch for a locked target and rejects malformed, missing or unchanged edits', () => {
  const f = fixture(),
    value = processing();
  const target = { kind: 'clip' as const, clipId: f.video.id };
  const track = f.project.tracks.find((track) => track.id === f.audio.trackId)!;
  track.locked = true;
  const before = structuredClone(f.project);
  expect(updateProjectAudioProcessing(f.project, target, value, f.id)).toEqual({
    ok: false,
    reason: 'locked',
  });
  expect(f.project).toEqual(before);
  expect(
    updateProjectAudioProcessing(f.project, target, { ...value, code: 'untrusted' }, f.id)
  ).toEqual({ ok: false, reason: 'invalid' });
  expect(
    updateProjectAudioProcessing(f.project, { kind: 'clip', clipId: 'missing' }, value, f.id)
  ).toEqual({ ok: false, reason: 'missing' });
  track.locked = false;
  expect(updateProjectAudioProcessing(f.project, target, undefined, f.id)).toEqual({
    ok: true,
    project: f.project,
  });
});
