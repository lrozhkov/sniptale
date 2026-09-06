import { readFile } from 'node:fs/promises';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { expect, it } from 'vitest';
import {
  encodeReviewProvenance,
  parseReviewProvenance,
} from '../../features/video/review/provenance';
import { inspectReviewMedia } from './media-index';
import { writeReviewPackets } from './packet-export';

it.each(['avc-aac.mp4', 'vp8-opus.webm'])(
  'preserves bounded provenance in a real %s container',
  async (name) => {
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
    const provenance = encodeReviewProvenance({
      format: 'sniptale.video-edit.v1',
      timeUnit: 'seconds',
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
    });
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
