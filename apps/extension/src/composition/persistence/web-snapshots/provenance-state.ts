export const WEB_SNAPSHOT_PROVENANCE_VERSION = 1;
export const WEB_SNAPSHOT_PACKAGE_MAINTENANCE_BATCH_SIZE = 3;
export const WEB_SNAPSHOT_PROVENANCE_FAILED_FIELD = 'provenanceSanitizationFailedVersion';
export const WEB_SNAPSHOT_PROVENANCE_VERSION_FIELD = 'provenanceSanitizedVersion';

export function markWebSnapshotProvenanceSanitized<T extends object>(record: T): T {
  const { [WEB_SNAPSHOT_PROVENANCE_FAILED_FIELD]: _failed, ...rest } = record as T &
    Record<string, unknown>;
  return {
    ...rest,
    [WEB_SNAPSHOT_PROVENANCE_VERSION_FIELD]: WEB_SNAPSHOT_PROVENANCE_VERSION,
  } as T;
}
