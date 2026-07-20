const LEGACY_CONTROLLED_CURSOR_ARTIFACT_IDS = [
  'sniptale-controlled-cursor-overlay',
  'sniptale-controlled-cursor-style',
  'sniptale-controlled-cursor-hide-style',
] as const;

export function clearLegacyControlledCursorArtifacts(): void {
  for (const artifactId of LEGACY_CONTROLLED_CURSOR_ARTIFACT_IDS) {
    document.getElementById(artifactId)?.remove();
  }
}
