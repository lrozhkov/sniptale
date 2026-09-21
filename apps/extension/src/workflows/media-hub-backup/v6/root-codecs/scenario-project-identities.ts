const INVALID_CHILD_IDENTITIES = 'Portable scenario project child identities are inconsistent.';

interface PortableScenarioChildIdentities {
  assets: readonly { entry: { id: string } }[];
  exports: readonly { id: string }[];
  exportThumbnails: readonly { exportId: string }[];
  stepDocuments: readonly { stepId: string }[];
}

function assertUnique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) throw new Error(INVALID_CHILD_IDENTITIES);
}

/** Rejects multiplicity before source identities can collapse into restore maps. */
export function assertUniquePortableScenarioChildIdentities(
  metadata: PortableScenarioChildIdentities
): void {
  assertUnique(metadata.assets.map((item) => item.entry.id));
  assertUnique(metadata.exports.map((item) => item.id));
  assertUnique(metadata.stepDocuments.map((item) => item.stepId));
  assertUnique(metadata.exportThumbnails.map((item) => item.exportId));
}
