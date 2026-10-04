import type { LocalStoragePolicy, NormalizedSettings } from '../../../contracts/settings';

export const LOCAL_STORAGE_RETENTION_DAY_OPTIONS = [1, 3, 7, 14, 30, 60, 90, 180, 365] as const;

export const DEFAULT_LOCAL_STORAGE_POLICY = {
  cleanupEnabled: true,
  defaultDestination: 'temporary',
  recordingDestination: 'temporary',
  webSnapshotDestination: 'library',
  draftRetentionDays: 30,
  videoDraftRetentionDays: 7,
  trashCleanupEnabled: false,
  trashRetentionDays: 30,
} satisfies LocalStoragePolicy;

export function resolveInitialStorageClass(
  settings: Pick<NormalizedSettings, 'localStoragePolicy'>,
  category: 'image' | 'recording' | 'web-snapshot' = 'image'
): LocalStoragePolicy['defaultDestination'] {
  const policy = settings.localStoragePolicy;
  if (category === 'web-snapshot') return policy.webSnapshotDestination ?? 'library';
  if (category === 'recording') return policy.recordingDestination ?? policy.defaultDestination;
  return policy.defaultDestination;
}

export function getDraftRetentionMs(
  policy: LocalStoragePolicy,
  kind: 'ordinary' | 'video'
): number | null {
  if (!policy.cleanupEnabled) return null;
  const days = kind === 'video' ? policy.videoDraftRetentionDays : policy.draftRetentionDays;
  return days * 24 * 60 * 60 * 1000;
}
