import { createReleaseControlOccurrences } from '../qa/composition/catalog/release-occurrences.mjs';

export const CI_DIFF_ONLY_CONTROL_IDS = Object.freeze(['qa.rule.changed-line-readability']);

const CI_EXCLUDED_CONTROL_IDS = Object.freeze({
  proof: new Set([
    ...CI_DIFF_ONLY_CONTROL_IDS,
    'qa.rule.test-coverage',
    'qa.rule.build',
    'qa.rule.release-archive',
  ]),
  release: new Set([
    ...CI_DIFF_ONLY_CONTROL_IDS,
    'qa.rule.unit-tests',
    'qa.rule.harness-unit-tests',
    'qa.rule.test-coverage',
  ]),
});

export function createCiProductControlOccurrences(lane) {
  const excluded = CI_EXCLUDED_CONTROL_IDS[lane];
  if (!excluded) throw new Error(`Unsupported CI product-control lane: ${String(lane)}`);
  return createReleaseControlOccurrences().filter(({ id }) => !excluded.has(id));
}

export function ciExcludedControlLabels(lane) {
  const excluded = CI_EXCLUDED_CONTROL_IDS[lane];
  if (!excluded) throw new Error(`Unsupported CI product-control lane: ${String(lane)}`);
  const labelsById = new Map(createReleaseControlOccurrences().map(({ id, label }) => [id, label]));
  return [...excluded].map((id) => labelsById.get(id)).filter(Boolean);
}
