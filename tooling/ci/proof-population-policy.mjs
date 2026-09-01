import { findQaStepDefinition } from '../qa/composition/catalog/definitions.mjs';

const REPOSITORY_FILE_TOOL_IDS = new Set([
  'qa.rule.ai-hygiene',
  'qa.rule.ast-grep',
  'qa.rule.design-system',
  'qa.rule.full-product-coverage',
  'qa.rule.html-sanitizer-ownership',
  'qa.rule.i18n',
  'qa.rule.jscpd',
  'qa.rule.knip',
  'qa.rule.mock-export-parity',
  'qa.rule.naming',
  'qa.rule.oxlint',
  'qa.rule.repository-readability',
  'qa.rule.sonarjs',
  'qa.rule.structural-risk',
]);

export function expectedProofPopulationKind(controlId) {
  const definition = findQaStepDefinition({ id: controlId });
  return definition?.kind === 'guardrail' || REPOSITORY_FILE_TOOL_IDS.has(controlId)
    ? 'repository-files'
    : 'repository-state';
}

export function attachProofPopulation(step, scope) {
  if (step.population || step.status === 'inherited') return step;
  const definition = findQaStepDefinition({ label: step.label });
  if (!definition) return step;
  const populationKind = expectedProofPopulationKind(definition.id);
  return {
    ...step,
    population:
      populationKind === 'repository-files'
        ? {
            scope: 'repo-wide',
            populationKind,
            scannedFileCount: (scope.targetFiles ?? []).length,
          }
        : { scope: 'repo-wide', populationKind },
  };
}

export function validateProofPopulation(step, controlId) {
  const expectedKind = expectedProofPopulationKind(controlId);
  if (
    step?.population?.scope !== 'repo-wide' ||
    step.population.populationKind !== expectedKind ||
    (expectedKind === 'repository-files' &&
      (!Number.isInteger(step.population.scannedFileCount) || step.population.scannedFileCount < 1))
  ) {
    throw new Error(`Candidate proof has an invalid trusted control population: ${controlId}`);
  }
}
