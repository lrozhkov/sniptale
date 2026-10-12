import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Output,
  Mp4OutputFormat,
  WebMOutputFormat,
} from 'mediabunny';
import { ACTION_SOUND_CATALOG } from '../../../../apps/extension/src/features/video/review/action-audio-catalog';
import { createReviewActionAudioSource } from '../../../../apps/extension/src/workflows/video-review/action-audio-source';
import { decodeReviewAudioClipBuffer } from '../../../../apps/extension/src/workflows/video-review/audio-clip-source';
import { inspectReviewMedia } from '../../../../apps/extension/src/workflows/video-review/media-index';
import { configuredReviewExportPlan } from '../../../../apps/extension/src/workflows/video-review/export-configuration';
import { resolveReviewOutputProfile } from '../../../../apps/extension/src/workflows/video-review/render-settings';
import type { QuickEditAdvancedState } from '../../../../apps/extension/src/features/video/review/advanced/types';
import type { ReviewMediaIndex } from '../../../../apps/extension/src/workflows/video-review/media-index';
import { buildReviewActionAudioPlan } from '../../../../apps/extension/src/features/video/review/action-audio';
import { buildReviewTimeMap } from '../../../../apps/extension/src/features/video/review/timeline';
import { createQuickEditAdvancedState } from '../../../../apps/extension/src/features/video/review/advanced/defaults';
import { buildReviewExportClipPlan } from '../../../../apps/extension/src/workflows/video-review/export-lifecycle';
import { openReviewAudioClipSource } from '../../../../apps/extension/src/workflows/video-review/audio-clip-source';
import { renderReviewAudio } from '../../../../apps/extension/src/workflows/video-review/audio-render';
import {
  iterateQuickEditActionAudioPlan,
  quickEditAudioSourceKey,
  buildQuickEditClipEnvelope,
} from '../../../../apps/extension/src/features/video/review/advanced/audio-plan';
import { createNeutralPresentationSettings } from '../../../../apps/extension/src/features/video/review/advanced/presentation';
import { planReviewPresentationSequence } from '../../../../apps/extension/src/features/video/review/presentation-sequence';
import { renderPresentationAudio } from '../../../../apps/extension/src/workflows/video-review/presentation-audio';

/** Read-only diagnostic uses the same configured decision as the UI and writer. */
export function configuredPlan(index: ReviewMediaIndex, advanced: QuickEditAdvancedState) {
  return {
    profile: resolveReviewOutputProfile(index, advanced, { frameRate: 0 }),
    plan: configuredReviewExportPlan({
      index,
      advanced,
      document: { edits: [], canvasComments: [] },
      renderSettings: { frameRate: 0 },
      actionAudioPresent: true,
    }),
  };
}

/** Bounded native test compares the one-second writer windows to an independently scheduled whole mix. */
export async function nativeWindows(
  kind: 'plain' | 'half' | 'double' | 'cut' | 'fragment' | 'bookends' = 'plain'
) {
  const signal = new AbortController().signal;
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  const segments = buildReviewTimeMap(
    2,
    kind === 'half' || kind === 'double'
      ? [
          {
            id: 'speed',
            kind: 'speed',
            start: 0,
            end: 2,
            requestedStart: 0,
            requestedEnd: 2,
            rate: kind === 'half' ? 0.5 : 2,
            audio: 'speed',
          },
        ]
      : kind === 'cut'
        ? [{ id: 'cut', kind: 'cut', start: 0.6, end: 0.8, requestedStart: 0.6, requestedEnd: 0.8 }]
        : []
  );
  const offset = kind === 'fragment' ? 0.995 : 0;
  const duration = kind === 'fragment' ? 0.355 : segments.at(-1)!.resultEnd;
  const plan = buildReviewActionAudioPlan({
    segments,
    applied: true,
    markers: [
      {
        ref: { kind: 'action', id: 'mouse' },
        start: 0.98,
        end: 0.98,
        eventType: 'CLICK',
        audio: { family: 'mouse' },
      },
      {
        ref: { kind: 'action', id: 'key' },
        start: 0.99,
        end: 1.54,
        eventType: 'KEY',
        audio: { family: 'keyboard', keyCount: 3 },
      },
      {
        ref: { kind: 'signal', id: 'typing' },
        start: 0,
        end: 2,
        eventType: 'typing',
        audio: { family: 'typing' },
      },
    ],
    settings: [
      {
        ref: { kind: 'action', id: 'mouse' },
        presetId: 'mouse-classic-v1',
        enabled: true,
        volume: 1,
        offset: 0,
      },
      {
        ref: { kind: 'action', id: 'key' },
        presetId: 'keyboard-v1',
        enabled: true,
        volume: 1,
        offset: 0,
      },
      {
        ref: { kind: 'signal', id: 'typing' },
        presetId: 'typing-natural-v1',
        enabled: true,
        volume: 1,
        offset: 0,
      },
    ],
  });
  const clips = await buildReviewExportClipPlan(
    {
      advanced,
      fragmentOffset: offset,
      signal,
      readProjectAsset: async () => null,
      action: { plan, offset, bounds: { start: offset, end: offset + duration } },
    },
    {
      openAudioSource: openReviewAudioClipSource,
      createActionSource: (signal) =>
        createReviewActionAudioSource({
          signal,
          getURL: (path) => new URL(path, location.origin + '/').href,
          fetch: (url, init) => fetch(url, init),
          decode: decodeReviewAudioClipBuffer,
        }),
    }
  );
  try {
    if (!clips.action) throw new Error('Action schedule is missing.');
    const settings = createNeutralPresentationSettings();
    if (kind === 'bookends') {
      const slot = {
        mode: 'video' as const,
        video: {
          assetId: 'silent-bookend',
          source: { duration: 1, width: 160, height: 90, mimeType: 'video/webm', size: 100 },
          trim: { start: 0, end: 0.5 },
          audio: { muted: false, gain: 1 },
          fit: 'contain' as const,
          fillColor: '#000000',
          crop: { panX: 0, panY: 0 },
        },
      };
      settings.intro = slot;
      settings.outro = slot;
    }
    const presentation = planReviewPresentationSequence({
      settings,
      mainDuration: duration,
      fragmentOffset: 0,
      includeBookends: true,
      rate: { numerator: 10, denominator: 1 },
    });
    if (!presentation.ok) throw new Error('Invalid native presentation.');
    const mainStart = presentation.plan.segments.find(
      (segment) => segment.name === 'main'
    )!.audioStart;
    const frames =
      kind === 'bookends'
        ? presentation.plan.segments.at(-1)!.audioEnd
        : Math.round(duration * 48000);
    const offline = new OfflineAudioContext(2, frames, 48000);
    for (const batch of iterateQuickEditActionAudioPlan(clips.action, {
      start: 0,
      end: duration,
    })) {
      for (const entry of batch) {
        const source = offline.createBufferSource();
        const buffer = clips.buffers.get(quickEditAudioSourceKey(entry.source));
        if (!buffer || 'read' in buffer) throw new Error('Native fixture buffer is missing.');
        source.buffer = buffer;
        const gain = offline.createGain();
        source.connect(gain);
        gain.connect(offline.destination);
        const envelope = buildQuickEditClipEnvelope({
          entry,
          duration: entry.duration,
          elapsed: 0,
        });
        const at = entry.timelineStart + (kind === 'bookends' ? mainStart / 48000 : 0);
        envelope.forEach(([time, value], index) =>
          index === 0
            ? gain.gain.setValueAtTime(value, at + time)
            : gain.gain.linearRampToValueAtTime(value, at + time)
        );
        source.start(at, entry.sourceOffset, entry.duration);
      }
    }
    const expected = (await offline.startRendering()).getChannelData(0);
    const actual = new Float32Array(expected.length);
    const renderingSegments = kind === 'fragment' ? buildReviewTimeMap(duration, []) : segments;
    if (kind === 'bookends') {
      for await (const sample of renderPresentationAudio({
        plan: presentation.plan,
        main: {
          track: null,
          segments: renderingSegments,
          isOriginalMuted: () => false,
          exportAudio: clips,
        },
        bookends: {
          intro: { track: null, muted: false, gain: 1 },
          outro: { track: null, muted: false, gain: 1 },
        },
        signal,
      }))
        sample.copyTo(actual.subarray(Math.round(sample.timestamp * 48000)), {
          planeIndex: 0,
          format: 'f32-planar',
        });
    } else {
      for (const segment of renderingSegments.filter((segment) => segment.kind !== 'cut'))
        for await (const sample of renderReviewAudio(null, segment, false, signal, clips))
          sample.copyTo(actual.subarray(Math.round(sample.timestamp * 48000)), {
            planeIndex: 0,
            format: 'f32-planar',
          });
    }
    let maximumError = 0,
      squaredError = 0,
      energy = 0;
    for (let i = 0; i < expected.length; i++) {
      const delta = actual[i]! - expected[i]!;
      maximumError = Math.max(maximumError, Math.abs(delta));
      squaredError += delta * delta;
      energy += expected[i]! ** 2;
    }
    return {
      maximumError,
      snr: 10 * Math.log10(energy / Math.max(Number.MIN_VALUE, squaredError)),
      busGain: clips.action.busGain,
      bufferCount: clips.buffers.size,
      frames: actual.length,
      kind,
      bookendsSilent:
        kind !== 'bookends' ||
        (actual.slice(0, mainStart).every((value) => value === 0) &&
          actual.slice(mainStart + Math.round(duration * 48000)).every((value) => value === 0)),
    };
  } finally {
    clips.dispose?.();
  }
}

/** Real browser/native decoder proof for the exact shipped bytes; no provider or simulated DSP. */
export async function samples() {
  const controller = new AbortController();
  const source = createReviewActionAudioSource({
    signal: controller.signal,
    getURL: (path) => new URL(path, location.origin + '/').href,
    fetch: (url, init) => fetch(url, init),
    decode: decodeReviewAudioClipBuffer,
  });
  try {
    const result = [];
    for (const [id, sample] of Object.entries(ACTION_SOUND_CATALOG)) {
      const buffer = await source.read(id);
      const body = await (await fetch(new URL(sample.path, location.origin + '/'))).arrayBuffer();
      const raw = new DataView(body);
      let peak = 0,
        error = 0;
      const pcm = buffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) {
        peak = Math.max(peak, Math.abs(pcm[i]!));
        error = Math.max(error, Math.abs(pcm[i]! - raw.getInt16(44 + i * 2, true) / 32768));
      }
      result.push({
        id,
        frames: buffer.length,
        rate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        peak,
        error,
      });
    }
    return result;
  } finally {
    source.dispose();
    controller.abort();
  }
}

/** Creates an actual video-only fixture by copying accepted encoded video packets into a fresh container. */
export async function silentSource(encoded: string, container: 'mp4' | 'webm') {
  const file = new Blob([Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0))]);
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const target = new BufferTarget();
  const output = new Output({
    target,
    format: container === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(),
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track?.codec) throw new Error('Fixture video is missing.');
    const config = await track.getDecoderConfig();
    if (!config) throw new Error('Fixture decoder configuration is missing.');
    const source = new EncodedVideoPacketSource(track.codec);
    output.addVideoTrack(source);
    await output.start();
    for await (const packet of new EncodedPacketSink(track).packets())
      await source.add(packet, { decoderConfig: config });
    await output.finalize();
    if (!target.buffer) throw new Error('Video-only fixture is empty.');
    const bytes = new Uint8Array(target.buffer);
    const result = new File([bytes], `silent.${container}`, { type: `video/${container}` });
    const index = await inspectReviewMedia(result, new AbortController().signal);
    const base64 = btoa(Array.from(bytes, (value) => String.fromCharCode(value)).join(''));
    return { encoded: base64, index };
  } catch (error) {
    await output.cancel();
    throw error;
  } finally {
    input.dispose();
  }
}

async function packets(file: Blob) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('Export video is missing.');
    const result = [];
    for await (const packet of new EncodedPacketSink(track).packets()) {
      const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(packet.data));
      result.push({
        time: packet.timestamp,
        hash: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
          ''
        ),
      });
    }
    return result;
  } finally {
    input.dispose();
  }
}

/** Independent read of the published container, packet payloads and decoded audible/silent intervals. */
export async function inspectActionExport(sourceEncoded: string, outputEncoded: string) {
  const file = (encoded: string) =>
    new Blob([Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))]);
  const output = file(outputEncoded);
  const index = await inspectReviewMedia(output, new AbortController().signal);
  const context = new AudioContext({ sampleRate: 48000 });
  try {
    const pcm = await context.decodeAudioData(await output.arrayBuffer());
    const data = pcm.getChannelData(0);
    let peak = 0;
    for (const sample of data) peak = Math.max(peak, Math.abs(sample));
    const energy = (start: number, end: number) => {
      let sum = 0;
      for (
        let i = Math.round(start * pcm.sampleRate);
        i < Math.min(data.length, Math.round(end * pcm.sampleRate));
        i++
      )
        sum += data[i]! ** 2;
      return sum;
    };
    return {
      index,
      sourcePackets: await packets(file(sourceEncoded)),
      outputPackets: await packets(output),
      mouseEnergy: energy(1, 1.2),
      typingEnergy: energy(2, 4.8),
      keyEnergy: energy(5, 5.6),
      silenceEnergy: energy(0.1, 0.8) + energy(7, 8),
      peak,
    };
  } finally {
    await context.close();
  }
}
