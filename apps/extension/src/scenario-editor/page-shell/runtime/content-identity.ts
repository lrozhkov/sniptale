import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';

/** Persistence reorders object keys; only the aggregate timestamp is outside draft content. */
export function guideProjectContentIdentity(project: GuideProject): string {
  return JSON.stringify({ ...project, updatedAt: 0 }, (_key, value: unknown) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
        )
      : value
  );
}
