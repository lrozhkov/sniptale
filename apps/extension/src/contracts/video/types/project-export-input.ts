export const MAX_PROJECT_EXPORT_INPUT_BYTES = 544 * 1024 * 1024;

export interface ProjectExportInputReference {
  contentSha256: string;
  jobId: string;
  projectId: string;
  retainedByteLength: number;
}

const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/u;
const MAX_JOB_ID_CHARACTERS = 128;
const MAX_PROJECT_ID_CHARACTERS = 256;

export function isProjectExportInputReference(
  value: unknown
): value is ProjectExportInputReference {
  if (!isRecord(value) || Object.keys(value).length !== 4) return false;
  return (
    isBoundedId(value['jobId'], MAX_JOB_ID_CHARACTERS) &&
    isBoundedId(value['projectId'], MAX_PROJECT_ID_CHARACTERS) &&
    typeof value['contentSha256'] === 'string' &&
    SHA256_DIGEST.test(value['contentSha256']) &&
    typeof value['retainedByteLength'] === 'number' &&
    Number.isSafeInteger(value['retainedByteLength']) &&
    value['retainedByteLength'] > 0 &&
    value['retainedByteLength'] <= MAX_PROJECT_EXPORT_INPUT_BYTES
  );
}

function isBoundedId(value: unknown, maxCharacters: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxCharacters;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
