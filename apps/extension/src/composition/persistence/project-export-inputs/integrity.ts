import { createSha256Digest } from '@sniptale/platform/security/digest';
import { MAX_PROJECT_EXPORT_INPUT_BYTES } from '../../../contracts/video/types/project-export-input';
import type { VideoProject } from '../../../features/video/project/types/model';
import { failProjectExportInput } from './errors';

export async function computeProjectExportIntegrity(project: VideoProject): Promise<{
  contentSha256: string;
  retainedByteLength: number;
}> {
  if ((project.effectSnapshots ?? []).some((snapshot) => snapshot.assets.length !== 0))
    failProjectExportInput('inputIntegrityFailure');
  const canonicalSource = JSON.stringify(canonicalize(project));
  const retainedByteLength = new TextEncoder().encode(canonicalSource).byteLength;
  assertRetainedBytes(retainedByteLength, true);
  return {
    contentSha256: await createSha256Digest(canonicalSource),
    retainedByteLength,
  };
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

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) failProjectExportInput('inputIntegrityFailure');
    return value;
  }
  if (value instanceof Blob) failProjectExportInput('inputIntegrityFailure');
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (!isRecord(value)) failProjectExportInput('inputIntegrityFailure');
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const entry = value[key];
    if (entry !== undefined) result[key] = canonicalize(entry);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
