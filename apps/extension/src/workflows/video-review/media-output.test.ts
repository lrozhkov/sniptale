import { createNeutralPresentationSettings } from '../../features/video/review/advanced/presentation';
import { planReviewPresentationSequence } from '../../features/video/review/presentation-sequence';
import { readFile } from 'node:fs/promises';
import { ALL_FORMATS, BlobSource, Input, EncodedAudioPacketSource } from 'mediabunny';
import { expect, it } from 'vitest';
import {
  encodeReviewProvenance,
  createPresentationReviewProvenance,
  parseReviewProvenance,
} from '../../features/video/review/provenance';
import { inspectReviewMedia } from './media-index';
import { writeReviewPackets } from './packet-export';
import { createReviewMediaOutput } from './media-output';

it.each(['aac', 'opus'] as const)(
  'binds the external %s sequence encoder to its exact presentation window',
  async (codec) => {
    const container = codec === 'aac' ? 'mp4' : 'webm';
    const source = new EncodedAudioPacketSource(codec);
    const window = {
      kind: codec === 'aac' ? ('aac-mp4' as const) : ('opus-webm' as const),
      sampleRate: 48000 as const,
      frameCount: 14640,
    };
    const args = {
      index: {
        duration: 1,
        boundaries: [0, 1],
        videoCodec: codec === 'aac' ? ('avc' as const) : ('vp8' as const),
        audioCodec: null,
        container,
        rotation: 0 as const,
      },
      processedAudio: null,
      signal: new AbortController().signal,
      writer: { async writeAt() {} },
      onAudioPacket() {},
      presentationAudio: { source, window },
    } satisfies Parameters<typeof createReviewMediaOutput>[0];
    expect(() => createReviewMediaOutput({ ...args, omitAudio: true })).toThrow('Conflicting');
    const tracks = createReviewMediaOutput(args);
    try {
      expect(tracks.audio?.kind).toBe('presentation');
      const audio = tracks.output.tracks.find((track) => track.isAudioTrack());
      expect(audio?.metadata.presentationWindow).toEqual(window);
      expect(Object.isFrozen(audio?.metadata.presentationWindow)).toBe(true);
    } finally {
      await tracks.output.cancel();
    }
  }
);

it('uses explicit sequence audibility rather than primary audio presence', async () => {
  const index = {
    duration: 1,
    boundaries: [0, 1],
    videoCodec: 'avc' as const,
    audioCodec: 'aac' as const,
    container: 'mp4' as const,
    rotation: 0 as const,
  };
  const common = {
    index,
    signal: new AbortController().signal,
    writer: { async writeAt() {} },
    onAudioPacket() {},
  };
  const silent = createReviewMediaOutput({ ...common, processedAudio: null, omitAudio: true });
  const audible = createReviewMediaOutput({
    ...common,
    index: { ...index, audioCodec: null },
    processedAudio: 'aac',
  });
  try {
    expect(silent.audio).toBeNull();
    expect(silent.output.tracks.filter((track) => track.isAudioTrack())).toHaveLength(0);
    expect(audible.audio?.kind).toBe('processed');
    expect(audible.output.tracks.filter((track) => track.isAudioTrack())).toHaveLength(1);
  } finally {
    await silent.output.cancel();
    await audible.output.cancel();
  }
});

it.each([false, true])(
  'preserves sequence durations only when requested: %s',
  async (preserveFrameTiming) => {
    const tracks = createReviewMediaOutput({
      index: {
        duration: 1,
        boundaries: [0, 1],
        videoCodec: 'avc',
        audioCodec: null,
        container: 'mp4',
        rotation: 0,
      },
      processedAudio: null,
      signal: new AbortController().signal,
      writer: { async writeAt() {} },
      onAudioPacket() {},
      sampleVideo: {
        codec: 'avc',
        fullCodecString: 'avc1.42001f',
        frameRate: 30,
        bitrate: 1000000,
        preserveFrameTiming,
      },
    });
    try {
      const track = tracks.output.tracks[0]!;
      expect(track.isVideoTrack()).toBe(true);
      if (!track.isVideoTrack()) throw new Error('Expected video track.');
      expect(track.metadata.frameRate).toBe(preserveFrameTiming ? undefined : 30);
    } finally {
      await tracks.output.cancel();
    }
  }
);

it.each([
  ['avc-aac.mp4', false],
  ['vp8-opus.webm', false],
  ['avc-aac.mp4', true],
  ['vp8-opus.webm', true],
] as const)(
  'preserves bounded provenance in a real %s container (presentation=%s)',
  async (name, presentation) => {
    const file = new Blob([await readFile(`tooling/test/e2e/fixtures/review-${name}`)]);
    const signal = new AbortController().signal;
    const index = await inspectReviewMedia(file, signal);
    const edit = {
      id: 'cut',
      kind: 'cut' as const,
      start: 2,
      end: 4,
      requestedStart: 2,
      requestedEnd: 4,
    };
    const base = {
      timeUnit: 'seconds' as const,
      source: {
        duration: 12,
        width: 160,
        height: 90,
        mimeType: `video/${index.container}`,
        size: file.size,
        filename: name,
      },
      revision: 2,
      exportedAt: 1,
      edits: [edit],
      audioReencoded: false,
    };
    const sequence = planReviewPresentationSequence({
      settings: createNeutralPresentationSettings(),
      mainDuration: 10,
      fragmentOffset: 0,
      includeBookends: true,
      rate: { numerator: 30, denominator: 1 },
    });
    if (!sequence.ok) throw new Error('Invalid fixture plan');
    const provenance = encodeReviewProvenance(
      presentation
        ? createPresentationReviewProvenance({
            base,
            plan: sequence.plan,
            output: {
              format: index.container,
              videoCodec: index.container === 'mp4' ? 'avc' : 'vp9',
              width: 160,
              height: 90,
              frameRateMode: 'constant',
            },
            includeBookends: true,
            watermarkBaked: false,
          })
        : { ...base, format: 'sniptale.video-edit.v1' }
    );
    let bytes = new Uint8Array(0);
    await writeReviewPackets({
      file,
      index,
      signal,
      provenance,
      edits: [edit],
      writer: {
        async writeAt(position, chunk) {
          const data = new Uint8Array(await chunk.arrayBuffer());
          const next = new Uint8Array(Math.max(bytes.length, position + data.length));
          next.set(bytes);
          next.set(data, position);
          bytes = next;
        },
      },
    });
    const result = new Input({ source: new BlobSource(new Blob([bytes])), formats: ALL_FORMATS });
    try {
      const tags = await result.getMetadataTags();
      expect(tags.comment).toBe(provenance);
      expect(parseReviewProvenance(tags.comment)).toMatchObject({
        edits: [edit],
        source: { filename: name },
        revision: 2,
      });
    } finally {
      result.dispose();
    }
  }
);
