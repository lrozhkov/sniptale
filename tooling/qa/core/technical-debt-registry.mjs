import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { repoRoot } from './shared.mjs';
import { collectCoverageOwnerViolations } from './technical-debt-coverage.mjs';
import { collectPolicyDispositionViolations } from './technical-debt-policy-dispositions.mjs';
import { validateEnforcedDebtSources } from './technical-debt-enforced-sources.mjs';
import { validateStaticBaselines } from './technical-debt-static-baselines.mjs';

export const TECHNICAL_DEBT_REGISTRY_PATH = 'tooling/configs/qa/technical-debt.data.json';

const CLASSIFICATIONS = new Set(['debt', 'accepted-architecture', 'tool-noise']);
const SOURCE_KINDS = new Set([
  'architecture',
  'codeql',
  'gitleaks',
  'jscpd',
  'license',
  'quality',
  'scc',
  'sonarjs',
]);
const REVIEW_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function parseJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function absolute(root, relativePath) {
  return path.join(root, relativePath);
}

function createViolation(rule, file, message) {
  return { rule, file, message };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStableId(value) {
  if (!isNonEmptyString(value)) return false;
  const [prefix, ...parts] = value.split('.');
  if (!['debt', 'accepted', 'noise'].includes(prefix) || parts.length < 2) return false;
  return parts.every(
    (part) => part.length > 0 && [...part].every((character) => /[a-z0-9-]/u.test(character))
  );
}

function stableDigest(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(sortObjectKeys(value)))
    .digest('hex');
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObjectKeys(value[key])])
  );
}

function validateEntryCommon(entry, index, violations, today) {
  const location = `${TECHNICAL_DEBT_REGISTRY_PATH}#entries[${index}]`;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    violations.push(
      createViolation('technical-debt-entry-shape', location, 'Entry must be an object.')
    );
    return;
  }
  if (!isStableId(entry.id)) {
    violations.push(
      createViolation(
        'technical-debt-id',
        location,
        'Entry id must be a stable classification-prefixed identifier.'
      )
    );
  }
  if (!CLASSIFICATIONS.has(entry.classification)) {
    violations.push(
      createViolation(
        'technical-debt-classification',
        location,
        'Entry classification must be debt, accepted-architecture, or tool-noise.'
      )
    );
  }
  validateEntryText(entry, location, violations);
  if (!REVIEW_DATE_PATTERN.test(entry.reviewBy ?? '') || entry.reviewBy < today) {
    violations.push(
      createViolation(
        'technical-debt-review-date',
        location,
        'Entry reviewBy must be a current or future YYYY-MM-DD date.'
      )
    );
  }
  validateEntrySource(entry, location, violations);
}

function validateEntryText(entry, location, violations) {
  for (const field of ['owner', 'risk', 'reason', 'removalCondition', 'targetAction']) {
    if (!isNonEmptyString(entry[field])) {
      violations.push(
        createViolation(
          'technical-debt-metadata',
          location,
          `Entry must define non-empty ${field}.`
        )
      );
    }
  }
}

function validateEntrySource(entry, location, violations) {
  if (
    !entry.source ||
    !SOURCE_KINDS.has(entry.source.kind) ||
    !isNonEmptyString(entry.source.key)
  ) {
    violations.push(
      createViolation(
        'technical-debt-source',
        location,
        'Entry must identify a supported source kind and exact source key.'
      )
    );
  }
  if (!entry.scope || typeof entry.scope !== 'object' || Array.isArray(entry.scope)) {
    violations.push(
      createViolation(
        'technical-debt-scope',
        location,
        'Entry must define an exact structured scope.'
      )
    );
  }
}

function indexEntries(entries, violations) {
  const byId = new Map();
  for (const [index, entry] of entries.entries()) {
    if (byId.has(entry?.id)) {
      violations.push(
        createViolation(
          'technical-debt-duplicate-id',
          TECHNICAL_DEBT_REGISTRY_PATH,
          `Duplicate entry id: ${entry.id}.`
        )
      );
    }
    byId.set(entry?.id, { entry, index });
  }
  return byId;
}

function requireLinkedEntry({
  baselineEntry,
  byId,
  classification,
  sourceKind,
  sourceKey,
  scope,
  file,
  violations,
}) {
  const linked = byId.get(baselineEntry.debtId)?.entry;
  if (!linked) {
    violations.push(
      createViolation(
        'technical-debt-missing-link',
        file,
        `Missing registry entry for debtId ${baselineEntry.debtId ?? '<missing>'}.`
      )
    );
    return;
  }
  const expected = { classification, source: { kind: sourceKind, key: sourceKey }, scope };
  const actual = {
    classification: linked.classification,
    source: linked.source,
    scope: linked.scope,
  };
  if (stableDigest(actual) !== stableDigest(expected)) {
    violations.push(
      createViolation(
        'technical-debt-scope-drift',
        file,
        `Registry metadata for ${linked.id} does not match the exact enforced source scope.`
      )
    );
  }
}

function validateReferencedPopulation(entries, expectedCount, violations) {
  if (entries.length !== expectedCount) {
    const message = [
      `Registry has ${entries.length} entries but enforced sources reference ${expectedCount}.`,
      'Remove stale entries or add missing source links.',
    ].join(' ');
    violations.push(
      createViolation('technical-debt-unreferenced-entry', TECHNICAL_DEBT_REGISTRY_PATH, message)
    );
  }
}

export function collectTechnicalDebtRegistryViolations({
  root = repoRoot,
  today = new Date().toISOString().slice(0, 10),
  registry = null,
} = {}) {
  const loaded = registry ?? parseJson(absolute(root, TECHNICAL_DEBT_REGISTRY_PATH));
  const violations = [];
  if (
    loaded.schemaVersion !== 1 ||
    !Array.isArray(loaded.entries) ||
    !Array.isArray(loaded.coverageOwners) ||
    !Array.isArray(loaded.policyDispositions)
  ) {
    return [
      createViolation(
        'technical-debt-schema',
        TECHNICAL_DEBT_REGISTRY_PATH,
        'Registry requires schemaVersion 1, entries, coverageOwners, and policyDispositions arrays.'
      ),
    ];
  }
  const byId = indexEntries(loaded.entries, violations);
  for (const [index, entry] of loaded.entries.entries())
    validateEntryCommon(entry, index, violations, today);
  const sourceContext = { byId, requireLinkedEntry, root, violations };
  const expectedCount =
    validateEnforcedDebtSources(sourceContext) + validateStaticBaselines(sourceContext);
  validateReferencedPopulation(loaded.entries, expectedCount, violations);
  violations.push(...collectCoverageOwnerViolations(loaded.coverageOwners, { root }));
  violations.push(
    ...collectPolicyDispositionViolations(loaded.policyDispositions, {
      registryPath: TECHNICAL_DEBT_REGISTRY_PATH,
      root,
    })
  );
  return violations;
}
