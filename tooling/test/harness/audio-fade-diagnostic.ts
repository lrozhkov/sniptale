import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../apps/extension/src/features/video/project/factories/creation';
import { createAudioClipFromAsset } from '../../../apps/extension/src/features/video/project/factories/clip';
import { collectRenderableAudioClips } from '../../../apps/extension/src/offscreen/project-export/offline-audio/clip-audio/collect';
import { scheduleOfflineAudioClipMix } from '../../../apps/extension/src/offscreen/project-export/offline-audio/mix/schedule';
import {
  planQuickEditClipPlayback,
  quickEditAudioSourceKey,
  type QuickEditAudioPlanEntry,
} from '../../../apps/extension/src/features/video/review/advanced/audio-plan';
import { renderReviewAudio } from '../../../apps/extension/src/workflows/video-review/audio-render';

const sampleRate = 48000;
const times = [0.5, 1.5, 2.2, 2.4, 2.6, 3.5];

function compare(samples: Float32Array, start: number, end: number, manual: boolean) {
  const expectedAt = (time: number) =>
    0.2 *
    Math.max(0, Math.min(1, time / 3, (4 - time) / 2)) *
    (manual ? 1.5 * (0.8 - (0.4 * time) / 4) : 0.8);
  return times
    .filter((time) => time > start && time < end)
    .map((time) => {
      const center = Math.round((time - start) * sampleRate);
      let error = 0;
      for (let delta = -128; delta < 128; delta++) {
        const index = center + delta;
        error += ((samples[index] ?? 0) - expectedAt(start + index / sampleRate)) ** 2;
      }
      return {
        time,
        actual: samples[center] ?? 0,
        expected: expectedAt(time),
        rmsError: Math.sqrt(error / 256),
      };
    });
}

/** Independent PCM expectations exercise production scheduling, collection and Gallery rendering. */
export async function runAudioFadeDiagnostic() {
  const results = [];
  for (const rate of [1, 2]) {
    const buffer = new AudioBuffer({ numberOfChannels: 1, length: 8 * sampleRate, sampleRate });
    buffer.getChannelData(0).fill(0.2);
    const project = createEmptyVideoProject('Fade diagnostic');
    const track = createVideoProjectTrack('Music', 1, 'AUDIO');
    track.audioVolume = 1.5;
    project.tracks.push(track);
    const asset = createVideoProjectAsset(
      'Music',
      'AUDIO',
      { kind: 'project-asset', projectAssetId: 'fade-source' },
      {
        width: 0,
        height: 0,
        duration: 8,
        mimeType: 'audio/wav',
        size: 0,
        hasAudio: true,
        audioPeaks: null,
      }
    );
    const clip = createAudioClipFromAsset(track.id, asset);
    Object.assign(clip, {
      duration: 4,
      sourceDuration: 4 * rate,
      playbackRate: rate,
      volume: 1,
      audioGainStart: 0.8,
      audioGainEnd: 0.4,
      volumeEnvelopeStart: 0.8,
      volumeEnvelopeEnd: 0.4,
      fadeInMs: 3000,
      fadeOutMs: 2000,
    });
    project.assets = [asset];
    project.clips = [clip];
    project.duration = 4;
    const before = JSON.stringify(project);
    for (const [start, end] of [
      [0, 4],
      [1.25, 3.25],
      [0, 2.7],
      [2.1, 4],
    ]) {
      if (start === undefined || end === undefined) throw new Error('Missing range');
      const context = new OfflineAudioContext(
        1,
        Math.round((end - start) * sampleRate),
        sampleRate
      );
      for (const input of collectRenderableAudioClips(project, {
        rangeStartSeconds: start,
        rangeEndSeconds: end,
      }))
        await scheduleOfflineAudioClipMix(context, input, buffer);
      const rendered = await context.startRendering();
      results.push({
        owner: 'montage-export',
        rate,
        start,
        end,
        rows: compare(rendered.getChannelData(0), start, end, true),
      });
    }
    const entry: QuickEditAudioPlanEntry = {
      lane: 'music',
      clipId: 'music',
      source: { kind: 'project', assetId: 'music' },
      timelineStart: 0,
      duration: 4,
      sourceOffset: 0,
      volume: 0.8,
      fadeIn: 3 * rate,
      fadeOut: 2 * rate,
      playbackRate: rate,
      fadePhase: { offset: 0, duration: 4 * rate },
    };
    for (const start of [0, 1.25]) {
      const context = new OfflineAudioContext(1, Math.round((4 - start) * sampleRate), sampleRate);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      source.connect(gain);
      gain.connect(context.destination);
      const plan = planQuickEditClipPlayback({ entry, outputTime: start, audioNow: 0 });
      if (!plan) throw new Error('Missing playback plan');
      plan.envelope.forEach(([at, value], index) =>
        index === 0
          ? gain.gain.setValueAtTime(value, at)
          : gain.gain.linearRampToValueAtTime(value, at)
      );
      source.playbackRate.value = plan.playbackRate ?? 1;
      source.start(plan.when, plan.offset, plan.duration);
      const rendered = await context.startRendering();
      results.push({
        owner: 'gallery-preview',
        rate,
        start,
        end: 4,
        rows: compare(rendered.getChannelData(0), start, 4, false),
      });
    }
    const output = new Float32Array(4 * sampleRate);
    for await (const sample of renderReviewAudio(
      null,
      { kind: 'keep', sourceStart: 0, sourceEnd: 4, resultStart: 0, resultEnd: 4, rate: 1 },
      true,
      new AbortController().signal,
      {
        entries: [entry],
        buffers: new Map([[quickEditAudioSourceKey(entry.source), buffer]]),
        originalVolume: 1,
        originalMuted: true,
      }
    )) {
      output.set(
        sample.toAudioBuffer().getChannelData(0),
        Math.round(sample.timestamp * sampleRate)
      );
    }
    results.push({
      owner: 'gallery-export',
      rate,
      start: 0,
      end: 4,
      rows: compare(output, 0, 4, false),
    });
    if (before !== JSON.stringify(project)) throw new Error('Source project changed');
  }
  return results;
}
