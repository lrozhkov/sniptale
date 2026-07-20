import { createSha256Digest } from '@sniptale/platform/security/digest';
import {
  assertEffectV1AssetSignature,
  sha256EffectV1Bytes,
} from '@sniptale/runtime-contracts/effect-v1';

import { MAX_PROJECT_EXPORT_INPUT_BYTES } from '../../../contracts/video/types/project-export-input';
import type { VideoProject } from '../../../features/video/project/types/model';
import { failProjectExportInput } from './errors';

export async function computeProjectExportIntegrity(project: VideoProject): Promise<{
  contentSha256: string;
  retainedByteLength: number;
}> {
  const blobDescriptors = new WeakMap<Blob, Record<string, unknown>>();
  let blobBytes = 0;
  for (const snapshot of project.effectSnapshots ?? []) {
    for (const asset of snapshot.assets) {
      const sha256 = await verifySnapshotAsset(asset);
      blobBytes += asset.blob.size;
      assertRetainedBytes(blobBytes);
      blobDescriptors.set(asset.blob, {
        byteLength: asset.blob.size,
        mimeType: asset.blob.type,
        sha256,
      });
    }
  }
  const canonicalSource = JSON.stringify(canonicalize(project, blobDescriptors));
  const metadataBytes = new TextEncoder().encode(canonicalSource).byteLength;
  const retainedByteLength = metadataBytes + blobBytes;
  assertRetainedBytes(retainedByteLength, true);
  return {
    contentSha256: await createSha256Digest(canonicalSource),
    retainedByteLength,
  };
}

async function verifySnapshotAsset(
  asset: NonNullable<VideoProject['effectSnapshots']>[number]['assets'][number]
): Promise<string> {
  if (asset.blob.size !== asset.byteLength) failProjectExportInput('inputIntegrityFailure');
  const bytes = new Uint8Array(await asset.blob.arrayBuffer());
  try {
    assertEffectV1AssetSignature(bytes, asset.mimeType, asset.id);
  } catch {
    failProjectExportInput('inputIntegrityFailure');
  }
  const sha256 = await sha256EffectV1Bytes(bytes);
  if (sha256 !== asset.sha256) failProjectExportInput('inputIntegrityFailure');
  return sha256;
}

function assertRetainedBytes(value: number, requirePositive = false): void {
  if (
    !Number.isSafeInteger(value) ||
    (requirePositive && value <= 0) ||
    value > MAX_PROJECT_EXPORT_INPUT_BYTES
  ) {
    failProjectExportInput('capacityExceeded');
  }
}

function canonicalize(value: unknown, blobs: WeakMap<Blob, Record<string, unknown>>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) failProjectExportInput('inputIntegrityFailure');
    return value;
  }
  if (value instanceof Blob) {
    const descriptor = blobs.get(value);
    if (!descriptor) failProjectExportInput('inputIntegrityFailure');
    return { __sniptaleProjectExportBlob: descriptor };
  }
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry, blobs));
  if (!isRecord(value)) failProjectExportInput('inputIntegrityFailure');
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const entry = value[key];
    if (entry !== undefined) result[key] = canonicalize(entry, blobs);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
