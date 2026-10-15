import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  EncodedPacketSink,
  Input,
  Output,
  VideoSample,
  VideoSampleSink,
  VideoSampleSource,
  WebMOutputFormat,
} from 'mediabunny';
import { inspectReviewMedia } from '../../../../apps/extension/src/workflows/video-review/media-index';
import { writeReviewPackets } from '../../../../apps/extension/src/workflows/video-review/packet-export';
import { writeReviewFrames } from '../../../../apps/extension/src/workflows/video-review/render-export';
import { createQuickEditAdvancedState } from '../../../../apps/extension/src/features/video/review/advanced/defaults';
import { resolveQuickEditEffectiveState } from '../../../../apps/extension/src/features/video/review/advanced/effective';
import { useReviewPlayback } from '../../../../apps/extension/src/gallery/video-review/use-playback';
import type { ReviewEdit } from '../../../../apps/extension/src/features/video/review/types';

export const rates = [1, 0.5, 0.25, 0.125, 0.0625] as const;

async function fixture() {
  const target = new BufferTarget();
  const output = new Output({ target, format: new WebMOutputFormat() });
  const source = new VideoSampleSource({ codec: 'vp8', bitrate: 1_000_000, keyFrameInterval: 1 });
  output.addVideoTrack(source, { frameRate: 30 });
  const canvas = Object.assign(document.createElement('canvas'), { width: 160, height: 90 });
  const context = canvas.getContext('2d')!;
  await output.start();
  for (let frame = 0; frame < 30; frame++) {
    context.fillStyle = '#202020';
    context.fillRect(0, 0, 160, 90);
    for (let bit = 0; bit < 5; bit++) {
      context.fillStyle = frame & (1 << bit) ? '#ffffff' : '#000000';
      context.fillRect(bit * 24, 0, 24, 24);
    }
    context.fillStyle = '#ffffff';
    context.fillRect(frame * 4, 40, 8, 30);
    const sample = new VideoSample(canvas, { timestamp: frame / 30, duration: 1 / 30 });
    try {
      await source.add(sample);
    } finally {
      sample.close();
    }
  }
  source.close();
  await output.finalize();
  return new Blob([target.buffer!]);
}

function editsFor(rate: (typeof rates)[number], duration: number): ReviewEdit[] {
  return rate === 1
    ? []
    : [
        {
          id: 'slow',
          kind: 'speed',
          start: 0,
          end: duration,
          requestedStart: 0,
          requestedEnd: duration,
          rate,
          audio: 'mute',
        },
      ];
}

async function inspect(file: Blob) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = (await input.getPrimaryVideoTrack())!;
    const packets = [];
    for await (const packet of new EncodedPacketSink(track).packets()) {
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(packet.data)))
      ).join(',');
      packets.push({ time: packet.timestamp, duration: packet.duration, hash });
    }
    const frames = [];
    const canvas = Object.assign(document.createElement('canvas'), { width: 160, height: 90 });
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    for await (const sample of new VideoSampleSink(track).samples()) {
      try {
        sample.draw(context, 0, 0, 160, 90);
        let id = 0;
        for (let bit = 0; bit < 5; bit++)
          if (context.getImageData(bit * 24 + 12, 12, 1, 1).data[0]! > 128) id |= 1 << bit;
        frames.push({ time: sample.timestamp, id });
      } finally {
        sample.close();
      }
    }
    const native = document.createElement('video');
    const url = URL.createObjectURL(file);
    try {
      const ready = new Promise<void>((resolve, reject) => {
        native.onloadedmetadata = () => resolve();
        native.onerror = () => reject(new Error('Export metadata unavailable'));
      });
      native.src = url;
      await ready;
      return {
        duration: native.duration,
        metadataDuration: await input.getDurationFromMetadata(),
        computedDuration: await input.computeDuration(),
        packets,
        frames,
      };
    } finally {
      native.removeAttribute('src');
      native.load();
      URL.revokeObjectURL(url);
    }
  } finally {
    input.dispose();
  }
}

/** Authored frame IDs distinguish unique motion from encoder frame duplication. */
export async function exportProbe() {
  const file = await fixture();
  const signal = new AbortController().signal;
  const index = await inspectReviewMedia(file, signal);
  const original = await inspect(file);
  const results = [];
  for (const rate of rates)
    for (const mode of ['copy', 'render', 'render60', 'cut-edge'] as const) {
      if (mode === 'cut-edge' && rate !== 1) continue;
      let bytes = new Uint8Array(0);
      const writer = {
        async writeAt(position: number, chunk: Blob) {
          const part = new Uint8Array(await chunk.arrayBuffer());
          if (position + part.length > bytes.length) {
            const next = new Uint8Array(position + part.length);
            next.set(bytes);
            bytes = next;
          }
          bytes.set(part, position);
        },
      };
      const advanced = createQuickEditAdvancedState();
      advanced.ui.mode = 'advanced';
      advanced.background = {
        enabled: true,
        type: 'solid',
        color: '#000000',
        layout: { padding: 0, cornerRadius: 0 },
      };
      const edits: ReviewEdit[] =
        mode === 'cut-edge'
          ? [
              {
                id: 'tail',
                kind: 'cut',
                start: 0.0668,
                end: index.duration,
                requestedStart: 0.0668,
                requestedEnd: index.duration,
              },
            ]
          : editsFor(rate, index.duration);
      const args = { file, index, edits, writer, signal };
      const receipt =
        mode === 'copy'
          ? await writeReviewPackets(args)
          : await writeReviewFrames({
              ...args,
              advanced,
              fragmentOffset: 0,
              readProjectAsset: async () => null,
              renderSettings: {
                frameRate: mode === 'render60' ? 60 : 30,
                quality: 'HIGH',
                codec: 'vp8',
              },
            });
      const output = await inspect(new Blob([bytes]));
      results.push({
        mode,
        fps: mode === 'render60' ? 60 : 30,
        rate,
        receipt,
        duration: output.duration,
        metadataDuration: output.metadataDuration,
        computedDuration: output.computedDuration,
        byteIdentity:
          mode === 'copy' && output.packets.every((p, i) => p.hash === original.packets[i]?.hash),
        packets: output.packets.map(({ time, duration }) => ({ time, duration })),
        frames: output.frames,
      });
    }
  return { source: { duration: original.duration, frames: original.frames }, results };
}

/** Mounts the actual native quick-editor transport, using each mode's effective audio policy. */
export async function previewProbe() {
  const file = await fixture();
  const url = URL.createObjectURL(file);
  const results = [];
  try {
    for (const mode of ['basic', 'advanced'] as const)
      for (const rate of rates) {
        const state = createQuickEditAdvancedState();
        state.ui.mode = mode;
        const effective = resolveQuickEditEffectiveState(state);
        const host = document.createElement('div');
        document.body.append(host);
        const root = createRoot(host);
        let failure = false;
        function Player() {
          const transport = useReviewPlayback({
            duration: 1,
            edits: editsFor(rate, 1),
            boundaries: () => undefined,
            onSeek: () => undefined,
            onFailure: () => {
              failure = true;
            },
            original: effective.originalAudio,
            silent: true,
          });
          return createElement('video', {
            ref: transport.video,
            src: url,
            muted: true,
            onPlay: () => transport.setPlaying(true),
            onPause: () => transport.setPlaying(false),
            onTimeUpdate: (event) => transport.onTime(event.currentTarget.currentTime),
            onEnded: transport.onEnded,
          });
        }
        flushSync(() => root.render(createElement(Player)));
        const video = host.querySelector('video')!;
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error('Preview load failed'));
        });
        const frames: { time: number; wall: number }[] = [];
        let handle = 0;
        const frame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
          frames.push({ time: metadata.mediaTime, wall: metadata.expectedDisplayTime });
          handle = video.requestVideoFrameCallback(frame);
        };
        handle = video.requestVideoFrameCallback(frame);
        await video.play();
        await new Promise((resolve) => setTimeout(resolve, rate === 1 ? 650 : 1800));
        video.pause();
        video.cancelVideoFrameCallback(handle);
        results.push({
          mode,
          rate,
          actualRate: video.playbackRate,
          failure,
          frames,
          dropped: video.getVideoPlaybackQuality().droppedVideoFrames,
        });
        flushSync(() => root.unmount());
        host.remove();
      }
  } finally {
    URL.revokeObjectURL(url);
  }
  return results;
}
