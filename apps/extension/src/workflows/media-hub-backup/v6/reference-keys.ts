/** Stable restore-session key for a scenario-owned child asset. */
export function scenarioAssetRestoreKey(sourceId: string): string {
  return `scenario-asset:${sourceId}`;
}
