import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../apps/extension/src/features/video/project/factories/creation';
import { createAudioClipFromAsset } from '../../../apps/extension/src/features/video/project/factories/clip';
import { getClipCompositeAudioGain } from '../../../apps/extension/src/features/video/project/timeline/presentation.gain';
import {
  collectRenderableAudioClips,
  clipAudioClipToExportRange,
} from '../../../apps/extension/src/offscreen/project-export/offline-audio/clip-audio/collect';
import { scheduleOfflineAudioClipMix } from '../../../apps/extension/src/offscreen/project-export/offline-audio/mix/schedule';
import type { EffectRuntimeAudioPlan } from '../../../apps/extension/src/features/video/composition/effect-runtime/audio/plan';

const SAMPLE_RATE = 48000;

/** Uses actual browser PCM rendering to compare independent attenuation with preview gain. */
export async function runOriginalAudioDiagnostic() {
  const project = createEmptyVideoProject('Original audio diagnostic');
  project.version = 6;
  project.duration = 6;
  const track = createVideoProjectTrack('Audio', 2, 'AUDIO');
  project.tracks.push(track);
  const asset = createVideoProjectAsset(
    'Source',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'diagnostic-source' },
    {
      width: 0,
      height: 0,
      duration: 6,
      mimeType: 'audio/wav',
      size: 0,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const source = createAudioClipFromAsset(track.id, asset);
  source.volume = 0.8;
  source.audioGainStart = 0.8;
  source.audioGainEnd = 0.4;
  source.volumeEnvelopeEnd = 0.5;
  const voiceAsset = { ...asset, id: 'voice-asset' };
  const take = createAudioClipFromAsset(track.id, voiceAsset, 1);
  take.duration = take.sourceDuration = 2;
  take.volume = 0;
  take.originalAudioMute = {
    volume: 0.5,
    targets: [{ assetId: source.assetId, sourceInstanceId: source.id }],
  };
  const second = {
    ...take,
    id: 'second',
    startTime: 2,
    originalAudioMute: { ...take.originalAudioMute, volume: 0.25 },
  };
  const silence = {
    ...take,
    id: 'silence',
    startTime: 4,
    duration: 0.5,
    sourceDuration: 0.5,
    originalAudioMute: { ...take.originalAudioMute, volume: 0 },
  };
  project.assets = [asset, voiceAsset];
  project.clips = [source, take, second, silence];
  const original = JSON.stringify(project);
  // EffectV1 plans are a separate export input and must keep their own layer gain.
  const effect: EffectRuntimeAudioPlan = {
    assetBlob: new Blob(),
    assetCacheKey: 'diagnostic-effect',
    assetMimeType: 'audio/wav',
    audioGainEnd: 1,
    audioGainStart: 1,
    duration: 6,
    effectInstanceId: 'effect',
    fadeInMs: 0,
    fadeOutMs: 0,
    id: 'effect:audio',
    muted: false,
    playbackRate: 1,
    snapshotId: 'snapshot',
    sourceDuration: 6,
    sourceKind: 'effect-snapshot',
    sourceStart: 0,
    startTime: 0,
    volume: 0.1,
    volumeEnvelopeEnd: 1,
    volumeEnvelopeStart: 1,
  };

  const render = async (start: number, end: number) => {
    const context = new OfflineAudioContext(
      1,
      Math.round((end - start) * SAMPLE_RATE),
      SAMPLE_RATE
    );
    const buffer = context.createBuffer(1, 6 * SAMPLE_RATE, SAMPLE_RATE);
    buffer.getChannelData(0).fill(0.2);
    const clips = collectRenderableAudioClips(project, {
      rangeStartSeconds: start,
      rangeEndSeconds: end,
    });
    const external = clipAudioClipToExportRange(effect, { start, end });
    if (external) clips.push(external);
    for (const clip of clips) await scheduleOfflineAudioClipMix(context, clip, buffer);
    const rendered = await context.startRendering();
    const samples = rendered.getChannelData(0);
    const times = [0.5, 1.5, 2.5, 3.5, 4.25, 5].filter((time) => time > start && time < end);
    return times.map((time) => {
      const center = Math.round((time - start) * SAMPLE_RATE);
      let squaredError = 0;
      for (let offset = -128; offset < 128; offset++) {
        const index = center + offset;
        const at = start + index / SAMPLE_RATE;
        const expected = 0.2 * (getClipCompositeAudioGain(project, source, at) + effect.volume);
        squaredError += ((samples[index] ?? 0) - expected) ** 2;
      }
      return {
        time,
        previewGain: getClipCompositeAudioGain(project, source, time),
        actual: samples[center] ?? 0,
        expected: 0.2 * (getClipCompositeAudioGain(project, source, time) + effect.volume),
        rmsError: Math.sqrt(squaredError / 256),
      };
    });
  };
  const full = await render(0, 6);
  const partial = await render(1.25, 5.5);
  return { full, partial, unchanged: JSON.stringify(project) === original };
}
