import type { LocalStoragePolicy, NormalizedSettings } from '../../../contracts/settings';

export const LOCAL_STORAGE_RETENTION_DAY_OPTIONS = [1, 3, 7, 14, 30, 60, 90, 180, 365] as const;

export const DEFAULT_LOCAL_STORAGE_POLICY: LocalStoragePolicy = {
  cleanupEnabled: true,
  defaultDestination: 'temporary',
  draftRetentionDays: 30,
  videoDraftRetentionDays: 7,
};

export function resolveInitialStorageClass(
  settings: Pick<NormalizedSettings, 'localStoragePolicy'>
): LocalStoragePolicy['defaultDestination'] {
  return settings.localStoragePolicy.defaultDestination;
}

export function getDraftRetentionMs(
  policy: LocalStoragePolicy,
  kind: 'ordinary' | 'video'
): number | null {
  if (!policy.cleanupEnabled) return null;
  const days = kind === 'video' ? policy.videoDraftRetentionDays : policy.draftRetentionDays;
  return days * 24 * 60 * 60 * 1000;
}
