import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';

function identity(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value
  );
}

/** Parses descriptive project/source placement without acquiring source ownership. */
export function parseVideoProjectPlacementBinding(
  value: unknown
): { kind: 'project' } | { kind: 'source'; assetId: string; sourceInstanceId: string } | null {
  if (!isRecord(value)) return null;
  if (value['kind'] === 'project' && Object.keys(value).length === 1) return { kind: 'project' };
  if (
    value['kind'] === 'source' &&
    Object.keys(value).length === 3 &&
    identity(value['assetId']) &&
    identity(value['sourceInstanceId'])
  )
    return {
      kind: 'source',
      assetId: value['assetId'],
      sourceInstanceId: value['sourceInstanceId'],
    };
  return null;
}
