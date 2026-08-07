// policyStateId: frame-annotation-raster-jobs - bounded one-shot raster payloads are
// deleted on consume, cancellation, expiry, or offscreen startup recovery.
import type { FrameAnnotationSnapshotV1 } from '../../../features/highlighter/frame-annotation';
import { parseFrameAnnotationSnapshot } from '../../../features/highlighter/frame-annotation';
import { FRAME_ANNOTATION_RASTER_JOBS_STORE, initDB } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';

const RETENTION_MS = 60 * 60 * 1_000;
const MAX_JOBS = 3;
const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_OUTPUT_PIXELS = 16_000_000;
const MAX_OUTPUT_SIDE = 16_384;

export interface FrameAnnotationRasterReference {
  jobId: string;
  revision: number;
  inputSha256: string;
}

export interface FrameAnnotationRasterInput {
  baseImage: Blob;
  width: number;
  height: number;
  snapshots: FrameAnnotationSnapshotV1[];
  requestedWidth?: number;
  requestedHeight?: number;
}

export interface FrameAnnotationRasterOutputMetadata {
  downscaled: boolean;
  outputWidth: number;
  outputHeight: number;
  outputScale: number;
}

interface FrameAnnotationRasterJobRecord extends FrameAnnotationRasterReference {
  createdAt: number;
  input: FrameAnnotationRasterInput;
  output?: Blob;
  outputSha256?: string;
  outputMetadata?: FrameAnnotationRasterOutputMetadata;
}

export async function stageFrameAnnotationRasterJob(options: {
  jobId: string;
  revision: number;
  input: FrameAnnotationRasterInput;
  now?: number;
}): Promise<FrameAnnotationRasterReference> {
  assertInput(options.input);
  await cleanupFrameAnnotationRasterJobs(options.now ?? Date.now());
  const inputSha256 = await computeInputDigest(options.input);
  const reference = { jobId: options.jobId, revision: options.revision, inputSha256 };
  const createdAt = options.now ?? Date.now();
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(FRAME_ANNOTATION_RASTER_JOBS_STORE, 'readwrite');
    const store = tx.objectStore(FRAME_ANNOTATION_RASTER_JOBS_STORE);
    const [keys, all] = await Promise.all([
      store.getAllKeys(),
      store.getAll() as Promise<unknown[]>,
    ]);
    let retained = 0;
    for (let index = 0; index < all.length; index += 1) {
      const value = all[index];
      const record = parseRecord(value, createdAt);
      if (!record) {
        const key = keys[index];
        if (key !== undefined) await store.delete(key);
      } else {
        retained += 1;
      }
    }
    if (retained >= MAX_JOBS || (await store.get(options.jobId)) !== undefined) {
      tx.abort();
      throw new Error('Frame annotation raster queue capacity exceeded');
    }
    await store.put({
      ...reference,
      createdAt,
      input: options.input,
    } satisfies FrameAnnotationRasterJobRecord);
    await tx.done;
  });
  return reference;
}

export async function acquireFrameAnnotationRasterInput(
  reference: FrameAnnotationRasterReference
): Promise<FrameAnnotationRasterInput> {
  const db = await initDB();
  const record = parseRecord(
    await db.get(FRAME_ANNOTATION_RASTER_JOBS_STORE, reference.jobId),
    Date.now()
  );
  await assertRecordReference(record, reference);
  return record!.input;
}

export async function completeFrameAnnotationRasterJob(
  reference: FrameAnnotationRasterReference,
  output: Blob,
  outputMetadata: FrameAnnotationRasterOutputMetadata
): Promise<void> {
  assertOutput(output, outputMetadata);
  const outputSha256 = await digestBlob(output);
  const db = await initDB();
  const validatedRecord = parseRecord(
    await db.get(FRAME_ANNOTATION_RASTER_JOBS_STORE, reference.jobId),
    Date.now()
  );
  await assertRecordReference(validatedRecord, reference);
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(FRAME_ANNOTATION_RASTER_JOBS_STORE, 'readwrite');
    const store = tx.objectStore(FRAME_ANNOTATION_RASTER_JOBS_STORE);
    const record = parseRecord(await store.get(reference.jobId), Date.now());
    assertRecordReferenceIdentity(record, reference);
    await store.put({ ...record!, output, outputSha256, outputMetadata });
    await tx.done;
  });
}

export async function consumeFrameAnnotationRasterOutput(
  reference: FrameAnnotationRasterReference
): Promise<{ blob: Blob; metadata: FrameAnnotationRasterOutputMetadata }> {
  const db = await initDB();
  const record = parseRecord(
    await db.get(FRAME_ANNOTATION_RASTER_JOBS_STORE, reference.jobId),
    Date.now()
  );
  await assertRecordReference(record, reference);
  if (!record?.output || !record.outputSha256 || !record.outputMetadata) {
    throw new Error('Frame annotation raster output is missing');
  }
  if ((await digestBlob(record.output)) !== record.outputSha256) {
    throw new Error('Frame annotation raster output integrity failure');
  }
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(FRAME_ANNOTATION_RASTER_JOBS_STORE, 'readwrite');
    const store = tx.objectStore(FRAME_ANNOTATION_RASTER_JOBS_STORE);
    const current = parseRecord(await store.get(reference.jobId), Date.now());
    assertRecordReferenceIdentity(current, reference);
    await store.delete(reference.jobId);
    await tx.done;
  });
  return { blob: record.output, metadata: record.outputMetadata };
}

export async function deleteFrameAnnotationRasterJob(jobId: string): Promise<void> {
  await runWithIndexedDbMutation((db) => db.delete(FRAME_ANNOTATION_RASTER_JOBS_STORE, jobId));
}

export async function deleteAllFrameAnnotationRasterJobs(): Promise<void> {
  await runWithIndexedDbMutation((db) => db.clear(FRAME_ANNOTATION_RASTER_JOBS_STORE));
}

export async function cleanupFrameAnnotationRasterJobs(now = Date.now()): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(FRAME_ANNOTATION_RASTER_JOBS_STORE, 'readwrite');
    const store = tx.objectStore(FRAME_ANNOTATION_RASTER_JOBS_STORE);
    const [keys, values] = await Promise.all([store.getAllKeys(), store.getAll()]);
    for (let index = 0; index < values.length; index += 1) {
      const record = parseRecord(values[index], now);
      if (!record) {
        const key = keys[index];
        if (key !== undefined) await store.delete(key);
      }
    }
    await tx.done;
  });
}

function assertInput(input: FrameAnnotationRasterInput): void {
  if (
    !(input.baseImage instanceof Blob) ||
    input.baseImage.type !== 'image/png' ||
    !Array.isArray(input.snapshots) ||
    !Number.isSafeInteger(input.width) ||
    !Number.isSafeInteger(input.height) ||
    input.width <= 0 ||
    input.height <= 0 ||
    input.snapshots.length > 5_000 ||
    (input.requestedWidth !== undefined &&
      (!Number.isSafeInteger(input.requestedWidth) || input.requestedWidth <= 0)) ||
    (input.requestedHeight !== undefined &&
      (!Number.isSafeInteger(input.requestedHeight) || input.requestedHeight <= 0)) ||
    input.snapshots.some((snapshot) => parseFrameAnnotationSnapshot(snapshot) === null)
  ) {
    throw new Error('Invalid frame annotation raster input');
  }
  const metadataBytes = encodeInputMetadata(input);
  if (input.baseImage.size + metadataBytes.byteLength > MAX_INPUT_BYTES) {
    throw new Error('Frame annotation raster input exceeds 64 MiB');
  }
}

function parseRecord(value: unknown, now: number): FrameAnnotationRasterJobRecord | null {
  if (!isRecord(value) || !isRecord(value['input'])) return null;
  const input = value['input'];
  if (!Array.isArray(input['snapshots'])) return null;
  const snapshots = input['snapshots'].map(parseFrameAnnotationSnapshot);
  if (
    typeof value['jobId'] !== 'string' ||
    value['jobId'].length === 0 ||
    !Number.isSafeInteger(value['revision']) ||
    Number(value['revision']) < 0 ||
    typeof value['inputSha256'] !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value['inputSha256']) ||
    !Number.isSafeInteger(value['createdAt']) ||
    Number(value['createdAt']) < 0 ||
    Number(value['createdAt']) > now ||
    now - Number(value['createdAt']) > RETENTION_MS ||
    !(input['baseImage'] instanceof Blob) ||
    input['baseImage'].type !== 'image/png' ||
    !Number.isSafeInteger(input['width']) ||
    Number(input['width']) <= 0 ||
    !Number.isSafeInteger(input['height']) ||
    Number(input['height']) <= 0 ||
    (input['requestedWidth'] !== undefined &&
      (!Number.isSafeInteger(input['requestedWidth']) || Number(input['requestedWidth']) <= 0)) ||
    (input['requestedHeight'] !== undefined &&
      (!Number.isSafeInteger(input['requestedHeight']) || Number(input['requestedHeight']) <= 0)) ||
    snapshots.length > 5_000 ||
    snapshots.some((snapshot) => snapshot === null) ||
    (value['output'] !== undefined &&
      (!(value['output'] instanceof Blob) ||
        value['output'].type !== 'image/png' ||
        value['output'].size > MAX_OUTPUT_BYTES)) ||
    (value['outputSha256'] !== undefined &&
      (typeof value['outputSha256'] !== 'string' ||
        !/^[a-f0-9]{64}$/.test(value['outputSha256']))) ||
    (value['outputMetadata'] !== undefined && !isOutputMetadata(value['outputMetadata']))
  )
    return null;
  const record = value as unknown as FrameAnnotationRasterJobRecord;
  try {
    assertInput({ ...record.input, snapshots: snapshots as FrameAnnotationSnapshotV1[] });
    if (record.output !== undefined || record.outputMetadata !== undefined) {
      if (!record.output || !record.outputSha256 || !record.outputMetadata) return null;
      assertOutput(record.output, record.outputMetadata);
    }
  } catch {
    return null;
  }
  return {
    ...record,
    input: { ...record.input, snapshots: snapshots as FrameAnnotationSnapshotV1[] },
  };
}

function isOutputMetadata(value: unknown): value is FrameAnnotationRasterOutputMetadata {
  return (
    isRecord(value) &&
    typeof value['downscaled'] === 'boolean' &&
    Number.isSafeInteger(value['outputWidth']) &&
    Number(value['outputWidth']) > 0 &&
    Number.isSafeInteger(value['outputHeight']) &&
    Number(value['outputHeight']) > 0 &&
    Number(value['outputWidth']) <= MAX_OUTPUT_SIDE &&
    Number(value['outputHeight']) <= MAX_OUTPUT_SIDE &&
    Number(value['outputWidth']) * Number(value['outputHeight']) <= MAX_OUTPUT_PIXELS &&
    typeof value['outputScale'] === 'number' &&
    Number.isFinite(value['outputScale']) &&
    value['outputScale'] > 0
  );
}

function assertOutput(output: Blob, metadata: FrameAnnotationRasterOutputMetadata): void {
  if (
    !(output instanceof Blob) ||
    output.type !== 'image/png' ||
    output.size > MAX_OUTPUT_BYTES ||
    !isOutputMetadata(metadata)
  ) {
    throw new Error('Invalid frame annotation raster output');
  }
}

async function assertRecordReference(
  record: FrameAnnotationRasterJobRecord | null,
  reference: FrameAnnotationRasterReference
): Promise<void> {
  if (
    !record ||
    record.jobId !== reference.jobId ||
    record.revision !== reference.revision ||
    record.inputSha256 !== reference.inputSha256 ||
    (await computeInputDigest(record.input)) !== reference.inputSha256
  )
    throw new Error('Frame annotation raster input integrity failure');
}

function assertRecordReferenceIdentity(
  record: FrameAnnotationRasterJobRecord | null,
  reference: FrameAnnotationRasterReference
): asserts record is FrameAnnotationRasterJobRecord {
  if (
    !record ||
    record.jobId !== reference.jobId ||
    record.revision !== reference.revision ||
    record.inputSha256 !== reference.inputSha256
  ) {
    throw new Error('Frame annotation raster input integrity failure');
  }
}

async function computeInputDigest(input: FrameAnnotationRasterInput): Promise<string> {
  assertInput(input);
  const metadata = encodeInputMetadata(input);
  const image = new Uint8Array(await input.baseImage.arrayBuffer());
  const combined = new Uint8Array(metadata.byteLength + image.byteLength);
  combined.set(metadata);
  combined.set(image, metadata.byteLength);
  return toHex(await crypto.subtle.digest('SHA-256', combined));
}

function encodeInputMetadata(input: FrameAnnotationRasterInput): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      width: input.width,
      height: input.height,
      requestedWidth: input.requestedWidth,
      requestedHeight: input.requestedHeight,
      snapshots: input.snapshots.map((snapshot) => {
        const parsed = parseFrameAnnotationSnapshot(snapshot);
        if (!parsed) throw new Error('Invalid frame annotation raster input');
        return parsed;
      }),
    })
  );
}

async function digestBlob(blob: Blob): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
