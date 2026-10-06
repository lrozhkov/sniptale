import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input } from 'mediabunny';
import { inspectReviewMedia } from '../../../../apps/extension/src/workflows/video-review/media-index';
import { writeReviewPackets } from '../../../../apps/extension/src/workflows/video-review/packet-export';
import { buildReviewTimeMap } from '../../../../apps/extension/src/features/video/review/timeline';
import { createReviewFragment } from '../../../../apps/extension/src/features/video/review/fragment';
import type { ReviewEdit } from '../../../../apps/extension/src/features/video/review/types';

async function videoPackets(file: Blob) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = (await input.getPrimaryVideoTrack())!;
    const packets = [];
    for await (const packet of new EncodedPacketSink(track).packets()) {
      const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(packet.data));
      packets.push({
        time: packet.timestamp,
        hash: Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, '0')).join(''),
      });
    }
    return packets;
  } finally {
    input.dispose();
  }
}

function rms(buffer: AudioBuffer, at: number) {
  const data = buffer.getChannelData(0);
  const start = Math.round(at * buffer.sampleRate);
  const end = Math.min(data.length, start + Math.round(buffer.sampleRate * 0.08));
  let sum = 0;
  for (let i = start; i < end; i++) sum += data[i]! ** 2;
  return Math.sqrt(sum / Math.max(1, end - start));
}

/** Real copied packets plus independently decoded PCM, including a rebased fragment. */
export async function probe(encoded: string) {
  const file = new Blob([Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))]);
  const signal = new AbortController().signal;
  const index = await inspectReviewMedia(file, signal);
  const b = index.boundaries;
  if (b.length < 5) throw new Error('Fixture needs at least five independent boundaries');
  const speed: ReviewEdit = {
    id: 'speed',
    kind: 'speed',
    start: b[1]!,
    end: b[2]!,
    requestedStart: b[1]!,
    requestedEnd: b[2]!,
    rate: 2,
    audio: 'speed',
  };
  const cut: ReviewEdit = {
    id: 'cut',
    kind: 'cut',
    start: b[2]!,
    end: b[3]!,
    requestedStart: b[2]!,
    requestedEnd: b[3]!,
  };
  const edited = [speed, cut];
  const fragment = createReviewFragment({
    selection: { kind: 'range', start: b[1]!, end: b.at(-2)! },
    duration: index.duration,
    boundaries: b,
    edits: edited,
  })!;
  const sourcePackets = await videoPackets(file);
  const decoder = new AudioContext({ sampleRate: 48000 });
  try {
    const sourcePcm = await decoder.decodeAudioData(await file.arrayBuffer());
    const results = [];
    for (const [name, edits] of [
      ['gain', []],
      ['cut-speed', edited],
      ['fragment', fragment.edits],
    ] as const) {
      let bytes = new Uint8Array(0);
      const receipt = await writeReviewPackets({
        file,
        index,
        edits,
        signal,
        exportAudio: {
          entries: [],
          buffers: new Map(),
          originalVolume: 0.5,
          originalMuted: false,
          originalRanges: [{ id: 'quiet', start: b[1]!, end: b[2]!, volume: 0 }],
        },
        writer: {
          async writeAt(position, chunk) {
            const part = new Uint8Array(await chunk.arrayBuffer());
            if (position + part.length > bytes.length) {
              const next = new Uint8Array(position + part.length);
              next.set(bytes);
              bytes = next;
            }
            bytes.set(part, position);
          },
        },
      });
      const output = new Blob([bytes]);
      const packets = await videoPackets(output);
      const pcm = await decoder.decodeAudioData(await output.arrayBuffer());
      const map = buildReviewTimeMap(index.duration, edits).filter((part) => part.kind !== 'cut');
      const expected = sourcePackets.flatMap((packet) => {
        const part = map.find(
          (item) =>
            packet.time >= item.sourceStart - 0.00001 && packet.time < item.sourceEnd - 0.00001
        );
        return part
          ? [
              {
                hash: packet.hash,
                time: part.resultStart + (packet.time - part.sourceStart) / part.rate,
              },
            ]
          : [];
      });
      const samples = [b[1]! / 2, (b[1]! + b[2]!) / 2, (b[3]! + b[4]!) / 2].flatMap(
        (sourceTime) => {
          const part = map.find(
            (item) => sourceTime > item.sourceStart && sourceTime < item.sourceEnd
          );
          if (!part) return [];
          const at = part.resultStart + (sourceTime - part.sourceStart) / part.rate;
          return [
            {
              ratio: rms(pcm, at) / rms(sourcePcm, sourceTime),
              expected: sourceTime > b[1]! && sourceTime < b[2]! ? 0 : 0.5,
            },
          ];
        }
      );
      results.push({
        name,
        receipt,
        packetCount: packets.length,
        expectedCount: expected.length,
        identical:
          packets.length === expected.length &&
          packets.every((packet, i) => packet.hash === expected[i]!.hash),
        timestampError: Math.max(
          ...packets.map((packet, i) => Math.abs(packet.time - (expected[i]?.time ?? -100)))
        ),
        grid:
          name === 'gain'
            ? [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 4.25, 7, 7.25].map((at) => ({
                at,
                ratio: rms(pcm, at) / rms(sourcePcm, at),
              }))
            : [],
        audioDuration: pcm.duration,
        expectedDuration: map.at(-1)!.resultEnd,
        samples,
      });
    }
    return results;
  } finally {
    await decoder.close();
  }
}

/** Independent read of the actual UI export. */
export async function inspect(encoded: string) {
  const file = new Blob([Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))]);
  const decoder = new AudioContext({ sampleRate: 48000 });
  try {
    const pcm = await decoder.decodeAudioData(await file.arrayBuffer());
    return { packets: await videoPackets(file), rms: rms(pcm, 0.25), duration: pcm.duration };
  } finally {
    await decoder.close();
  }
}
