import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { readOssReleaseConsumerManifest } from './oss-release-consumer-discovery.mjs';

const WORKFLOW_ORDER_MARKER = '`implementation → qa:checkpoint → required review → qa:closeout`';
const WORKFLOW_ORDER_DOCS = [
  'AGENTS.md',
  'docs/tooling/code-quality.md',
  'docs/tooling/wrapper-summary.md',
];

function contributionDocumentErrors(root) {
  const contributing = readFileSync(path.resolve(root, 'CONTRIBUTING.md'), 'utf8');
  const conduct = readFileSync(path.resolve(root, 'CODE_OF_CONDUCT.md'), 'utf8');
  const closedPolicy =
    /welcomes bug reports/iu.test(contributing) &&
    /does not currently accept external code contributions/iu.test(contributing) &&
    /patches and pull requests may be closed/iu.test(contributing);
  const contradiction = [
    /(?:^|[.!?]\s+)sniptale accepts? (?:external )?code contributions/iu,
    /(?:^|[.!?]\s+)sniptale welcomes? (?:external )?code contributions/iu,
    /sniptale accepts contributions that/iu,
    /patches and pull requests are (?:accepted|welcome)/iu,
  ].some((pattern) => pattern.test(contributing));
  return closedPolicy && !contradiction && conduct.includes('Lev Rozhkov')
    ? []
    : ['external contribution policy or conduct enforcement owner is incomplete'];
}

export function validateDocuments(root, policy) {
  const errors = [];
  const requiredFiles = [...policy.contributorFiles, ...policy.releaseDocs];
  for (const relativePath of new Set(requiredFiles)) {
    const absolutePath = path.resolve(root, relativePath);
    if (!existsSync(absolutePath)) {
      errors.push(`OSS contributor/release document is missing: ${relativePath}`);
      continue;
    }
    const contents = readFileSync(absolutePath, 'utf8');
    for (const fragment of policy.forbiddenReleaseDocFragments) {
      if (contents.includes(fragment)) {
        errors.push(`retired release documentation fragment in ${relativePath}: ${fragment}`);
      }
    }
  }
  if (existsSync(path.resolve(root, 'SECURITY.md'))) {
    errors.push('SECURITY.md is excluded from this local release surface');
  }
  const release = readFileSync(path.resolve(root, 'docs/oss/release.md'), 'utf8');
  errors.push(...contributionDocumentErrors(root));
  for (const command of ['qa:release-harness', 'qa:checkpoint', 'qa:release', 'qa:audit']) {
    if (!release.includes(command)) errors.push(`release documentation is missing ${command}`);
  }
  if (!release.includes('Corresponding Source') || !release.includes('AGPL-3.0-or-later')) {
    errors.push('release documentation is missing corresponding-source terms');
  }
  for (const relativePath of WORKFLOW_ORDER_DOCS) {
    const contents = existsSync(path.resolve(root, relativePath))
      ? readFileSync(path.resolve(root, relativePath), 'utf8')
      : '';
    if (!contents.includes(WORKFLOW_ORDER_MARKER)) {
      errors.push(`workflow document is missing checkpoint-before-review order: ${relativePath}`);
    }
    if (/before the first `qa:checkpoint`/u.test(contents)) {
      errors.push(`workflow document retains review-before-checkpoint guidance: ${relativePath}`);
    }
  }
  return errors;
}

const REQUIRED_CONSUMER_INTEGRATIONS = new Map([
  ['tooling/qa/core/verify-focused-triggered.execution.mjs', 'validator-integration'],
  ['tooling/qa/core/verify-all.violation-steps.architecture.mjs', 'validator-integration'],
  ['tooling/configs/qa/validation-manifest.json', 'validator-integration'],
  ['tooling/qa/core/qa-steps/definitions.data.mjs', 'validator-integration'],
  ['package.json', 'release-command'],
  ['apps/extension/manifest.json', 'bundled-font'],
  ['apps/extension/build/layout.data.json', 'bundled-font'],
  ['apps/extension/vite.config.ts', 'bundled-font'],
  ['packages/ui/src/styles/fonts.css', 'bundled-font'],
]);
const REQUIRED_CONSUMER_CATEGORIES = [
  'archive-integration',
  'bundled-font',
  'release-command',
  'validator-integration',
];

function sameConsumers(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateConsumers(root, policy, inventory) {
  const errors = [];
  let manifest;
  try {
    manifest = readOssReleaseConsumerManifest(root, policy.releaseConsumerManifest);
  } catch {
    return [`OSS release consumer manifest is missing: ${policy.releaseConsumerManifest}`];
  }
  const consumers = inventory.currentTree.releaseConsumers;
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest?.consumers)) {
    errors.push('OSS release consumer manifest has an invalid schema');
    return errors;
  }
  if (!sameConsumers(manifest.consumers, consumers)) {
    errors.push('OSS release consumer manifest is incomplete or stale');
  }
  for (const category of REQUIRED_CONSUMER_CATEGORIES) {
    if (!consumers.some((consumer) => consumer.category === category)) {
      errors.push(`OSS release consumer category is undiscovered: ${category}`);
    }
  }
  for (const [relativePath, category] of REQUIRED_CONSUMER_INTEGRATIONS) {
    if (
      !consumers.some(
        (consumer) => consumer.path === relativePath && consumer.category === category
      )
    ) {
      errors.push(`OSS release integration is undiscovered: ${relativePath} (${category})`);
    }
  }
  return errors;
}
