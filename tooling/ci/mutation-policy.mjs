export const MUTATION_PROFILES = Object.freeze(['persistence', 'secrets']);
export const MUTATION_EVIDENCE_FILES = Object.freeze(['stryker-report.json', 'summary.json']);

export function resolveMutationRunLabel(environment = process.env) {
  const label = environment.GITHUB_RUN_ID ?? 'local';
  if (!/^[a-z0-9-]+$/u.test(label)) {
    throw new Error(`Invalid mutation run label: ${String(label)}`);
  }
  return label;
}
