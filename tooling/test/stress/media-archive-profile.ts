import { openAsBlob } from 'node:fs';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import {
  createArchiveWriter,
  openArchiveReader,
  type ExportSink,
} from '../../../apps/extension/src/composition/archive-transfer/index.ts';

const GIB = 1024 * 1024 * 1024;
const profile = process.argv.includes('--certify') ? 'certify' : 'pr';
const entryCount = profile === 'certify' ? 25_000 : 2_001;
const targetArchiveBytes = profile === 'certify' ? 16 * GIB : GIB;
const targetPayloadBytes =
  profile === 'certify' ? targetArchiveBytes - 16 * 1024 * 1024 : targetArchiveBytes;
const objectCount = entryCount - 1;
const objectBytes = Math.floor(targetPayloadBytes / objectCount);
const workspace = await mkdtemp(join(tmpdir(), 'sniptale-media-archive-'));
const sourcePath = join(workspace, 'source.bin');
const archivePath = join(workspace, `${profile}.zip`);

try {
  const source = await open(sourcePath, 'w');
  await source.truncate(objectBytes);
  await source.close();
  const sourceBlob = await openAsBlob(sourcePath, { type: 'application/octet-stream' });
  let written = 0;
  const output = await open(archivePath, 'w');
  const outputStream = Writable.toWeb(output.createWriteStream()) as WritableStream<Uint8Array>;
  const sink: ExportSink = {
    writable: outputStream,
    close: async () => outputStream.getWriter().close(),
    abort: async (reason) => outputStream.getWriter().abort(reason),
  };
  const baselineHeap = process.memoryUsage().heapUsed;
  let peakHeap = baselineHeap;
  const writer = createArchiveWriter(sink, {
    onBytesWritten(bytes) {
      written = bytes;
      peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
    },
  });
  await writer.addText(
    'manifest.json',
    JSON.stringify({ entryCount, profile, targetArchiveBytes, targetPayloadBytes, version: 6 })
  );
  for (let index = 0; index < objectCount; index += 1) {
    await writer.addBlob(`objects/${String(index).padStart(6, '0')}/payload.bin`, sourceBlob);
  }
  await writer.close();

  if (profile === 'certify') {
    const archiveBlob = await openAsBlob(archivePath, { type: 'application/zip' });
    const reader = await openArchiveReader(archiveBlob);
    if (reader.entries().length !== entryCount) {
      throw new Error(`Certification entry count mismatch: ${reader.entries().length}.`);
    }
    for (const entry of reader.entries()) {
      const sourceEntry = reader.entry(entry.path);
      if (!sourceEntry) throw new Error(`Certification entry disappeared: ${entry.path}.`);
      await sourceEntry.pipeTo(new WritableStream<Uint8Array>({ write() {} }));
    }
    await reader.close();
  }

  const peakHeapDelta = peakHeap - baselineHeap;
  if (peakHeapDelta > 256 * 1024 * 1024) {
    throw new Error(`Archive heap delta exceeded 256 MiB: ${peakHeapDelta}.`);
  }
  process.stdout.write(
    `${JSON.stringify({ entryCount, objectBytes, peakHeapDelta, profile, written })}\n`
  );
} finally {
  await rm(workspace, { force: true, recursive: true });
}
