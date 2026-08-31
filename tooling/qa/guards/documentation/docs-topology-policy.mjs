import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const DOCS_TOPOLOGY_POLICY = 'tooling/configs/qa/docs-topology.data.json';

function validPaths(value) {
  return Array.isArray(value) && value.every((path) => typeof path === 'string' && path.length > 0);
}

export function docsTopologyPolicyErrors(policy) {
  const retiredArchiveFields = ['archiveIndex', 'archivedDocuments', 'archiveDigests'];
  const lists = [
    policy?.activeDocuments,
    policy?.generatedDocuments,
    policy?.rootDocuments,
    policy?.skillDocuments,
    policy?.productDocuments,
    policy?.requiredIndexContractFragments,
    policy?.retiredActivePrefixes,
    policy?.retiredActivePaths,
    policy?.forbiddenActiveFragments,
  ];
  if (
    policy?.schemaVersion !== 2 ||
    typeof policy?.activeIndex !== 'string' ||
    retiredArchiveFields.some((field) => Object.hasOwn(policy ?? {}, field)) ||
    lists.some((list) => !validPaths(list))
  ) {
    return ['invalid docs topology policy'];
  }
  const classified = [
    policy.activeIndex,
    ...policy.activeDocuments,
    ...policy.generatedDocuments,
    ...policy.rootDocuments,
    ...policy.skillDocuments,
    ...policy.productDocuments,
  ];
  const duplicates = classified.filter((path, index) => classified.indexOf(path) !== index);
  if (duplicates.length > 0) return [`duplicate docs classification: ${duplicates[0]}`];
  return [];
}

export function readDocsTopologyPolicy(root = process.cwd()) {
  const policy = JSON.parse(readFileSync(resolve(root, DOCS_TOPOLOGY_POLICY), 'utf8'));
  const errors = docsTopologyPolicyErrors(policy);
  if (errors.length > 0) throw new Error(errors.join('; '));
  return policy;
}
