import type { NativeRejectReason } from '../../../contracts/native-app';
import { listNativeTransferChunks, putNativeTransferChunkAndSession } from './persistence/staging';
import type { NativeTransferChunkEntry, NativeTransferSessionEntry } from './persistence/contracts';
import { calculateSha256Hex, decodeNativeBase64Chunk, NativeSha256 } from './hash';

interface StageNativeTransferChunkArgs {
  base64: string;
  chunkByteOffset: number;
  chunkIndex: number;
  chunkRawBytes: number;
  chunkSha256: string;
  session: NativeTransferSessionEntry;
}

function assertChunkMatchesSession(args: {
  chunkByteOffset: number;
  chunkIndex: number;
  chunkRawBytes: number;
  session: NativeTransferSessionEntry;
}): NativeRejectReason | null {
  const expectedOffset = args.session.receivedBytes;
  if (args.chunkIndex >= args.session.chunkCount || args.chunkByteOffset !== expectedOffset) {
    return 'duplicate-or-replay';
  }
  if (args.session.receivedChunkIndexes.includes(args.chunkIndex)) {
    return 'duplicate-or-replay';
  }
  if (args.session.receivedBytes + args.chunkRawBytes > args.session.totalBytes) {
    return 'oversized-payload';
  }
  return null;
}

async function decodeAndVerifyChunk(
  args: StageNativeTransferChunkArgs
): Promise<Uint8Array | NativeRejectReason> {
  let bytes: Uint8Array;
  try {
    bytes = decodeNativeBase64Chunk(args.base64);
  } catch {
    return 'malformed-message';
  }
  if (bytes.byteLength !== args.chunkRawBytes) {
    return 'malformed-message';
  }
  if ((await calculateSha256Hex(bytes)) !== args.chunkSha256.toLowerCase()) {
    return 'hash-mismatch';
  }
  return bytes;
}

function createChunkEntry(args: StageNativeTransferChunkArgs, bytes: Uint8Array, now: number) {
  const chunkBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(chunkBuffer).set(bytes);
  return {
    blob: new Blob([chunkBuffer], { type: args.session.mimeType }),
    chunkByteOffset: args.chunkByteOffset,
    chunkIndex: args.chunkIndex,
    chunkRawBytes: args.chunkRawBytes,
    chunkSha256: args.chunkSha256,
    createdAt: now,
    sessionId: args.session.id,
  } satisfies NativeTransferChunkEntry;
}

async function persistNativeTransferChunk(
  args: StageNativeTransferChunkArgs,
  bytes: Uint8Array
): Promise<NativeRejectReason | null> {
  const now = Date.now();
  const receivedChunkIndexes = [...args.session.receivedChunkIndexes, args.chunkIndex];
  receivedChunkIndexes.sort((left, right) => left - right);
  try {
    await putNativeTransferChunkAndSession({
      chunk: createChunkEntry(args, bytes, now),
      session: {
        ...args.session,
        receivedBytes: args.session.receivedBytes + args.chunkRawBytes,
        receivedChunkIndexes,
        updatedAt: now,
      },
    });
  } catch {
    return 'storage-failed';
  }
  return null;
}

export async function stageNativeTransferChunk(
  args: StageNativeTransferChunkArgs
): Promise<NativeRejectReason | null> {
  const rejected = assertChunkMatchesSession(args);
  if (rejected) {
    return rejected;
  }

  const bytes = await decodeAndVerifyChunk(args);
  if (!(bytes instanceof Uint8Array)) {
    return bytes;
  }
  return persistNativeTransferChunk(args, bytes);
}

export async function loadOrderedNativeChunkBlobs(
  session: NativeTransferSessionEntry
): Promise<Blob[]> {
  const chunks = await listNativeTransferChunks(session.id);
  chunks.sort((left, right) => left.chunkIndex - right.chunkIndex);
  return chunks.map((chunk) => chunk.blob);
}

export async function verifyNativeTransferChunks(
  session: NativeTransferSessionEntry
): Promise<{ blobs: Blob[]; ok: true } | { ok: false }> {
  const chunks = await listNativeTransferChunks(session.id);
  chunks.sort((left, right) => left.chunkIndex - right.chunkIndex);
  if (chunks.length !== session.chunkCount) {
    return { ok: false };
  }

  const hash = new NativeSha256();
  const blobs: Blob[] = [];
  let expectedOffset = 0;
  for (const [index, chunk] of chunks.entries()) {
    if (!chunkMatchesSession(chunk, index, expectedOffset, session.id)) {
      return { ok: false };
    }
    const bytes = new Uint8Array(await chunk.blob.arrayBuffer());
    if (bytes.byteLength !== chunk.chunkRawBytes) {
      return { ok: false };
    }
    hash.update(bytes);
    expectedOffset += chunk.chunkRawBytes;
    blobs.push(chunk.blob);
  }

  return expectedOffset === session.totalBytes && hash.digestHex() === session.sha256.toLowerCase()
    ? { blobs, ok: true }
    : { ok: false };
}

function chunkMatchesSession(
  chunk: NativeTransferChunkEntry,
  index: number,
  expectedOffset: number,
  sessionId: string
): boolean {
  return (
    chunk.sessionId === sessionId &&
    chunk.chunkIndex === index &&
    chunk.chunkByteOffset === expectedOffset
  );
}

export async function verifyNativeTransferBlob(
  session: NativeTransferSessionEntry,
  blob: Blob
): Promise<boolean> {
  return (
    blob.size === session.totalBytes &&
    (await calculateSha256Hex(blob)) === session.sha256.toLowerCase()
  );
}

export async function hasEnoughNativeStorageBudget(totalBytes: number): Promise<boolean> {
  const estimate = await navigator.storage?.estimate?.();
  if (!estimate?.quota || estimate.usage === undefined) {
    return true;
  }
  return estimate.quota - estimate.usage > totalBytes;
}
