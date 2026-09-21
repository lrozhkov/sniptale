import { isRecord, isString } from '@sniptale/runtime-contracts/validation/primitives';

export function parseArchiveRestoreChildIdMap(value: unknown): Record<string, string> | null {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (
    entries.some(
      ([sourceId, targetId]) =>
        sourceId.length === 0 || !isString(targetId) || targetId.length === 0
    )
  ) {
    return null;
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

export function mergeArchiveRestoreChildIdMap(
  current: Readonly<Record<string, string>>,
  additions: Readonly<Record<string, string>>
): Record<string, string> {
  const parsed = parseArchiveRestoreChildIdMap(additions);
  if (!parsed) throw new Error('Archive restore child ID mapping is invalid.');
  if (Object.keys(parsed).some((sourceId) => sourceId in current)) {
    throw new Error('Archive restore child ID is already mapped.');
  }
  return { ...current, ...parsed };
}
