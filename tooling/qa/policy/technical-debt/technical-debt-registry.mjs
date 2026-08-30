import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { repoRoot } from '../../analysis/repository/shared-paths.mjs';
export const TECHNICAL_DEBT_REGISTRY_PATH = 'tooling/configs/qa/technical-debt.data.json';

const CLASSIFICATIONS = new Set(['debt', 'accepted-architecture', 'tool-noise']);
const SOURCE_KINDS = new Set([
  'architecture',
  'codeql',
  'gitleaks',
  'license',
  'quality',
  'scc',
  'sonarjs',
]);
const REVIEW_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const ENTRY_KEYS = [
  'classification',
  'id',
  'owner',
  'reason',
  'removalCondition',
  'reviewBy',
  'risk',
  'scope',
  'source',
  'targetAction',
];
const SOURCE_KEYS = ['key', 'kind'];

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
  if (Object.keys(entry).sort().join(',') !== ENTRY_KEYS.join(',')) {
    violations.push(
      createViolation(
        'technical-debt-entry-shape',
        location,
        `Entry requires exactly: ${ENTRY_KEYS.join(', ')}.`
      )
    );
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
  const expectedPrefix = {
    debt: 'debt',
    'accepted-architecture': 'accepted',
    'tool-noise': 'noise',
  }[entry.classification];
  if (expectedPrefix && !entry.id.startsWith(`${expectedPrefix}.`)) {
    violations.push(
      createViolation(
        'technical-debt-id-classification',
        location,
        'Entry id prefix must match its classification.'
      )
    );
  }
  validateEntryText(entry, location, violations);
  const reviewDate = entry.reviewBy ?? '';
  const parsedReviewDate = new Date(`${reviewDate}T00:00:00.000Z`);
  if (
    !REVIEW_DATE_PATTERN.test(reviewDate) ||
    Number.isNaN(parsedReviewDate.getTime()) ||
    parsedReviewDate.toISOString().slice(0, 10) !== reviewDate ||
    reviewDate < today
  ) {
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
    typeof entry.source !== 'object' ||
    Array.isArray(entry.source) ||
    Object.keys(entry.source).sort().join(',') !== SOURCE_KEYS.join(',') ||
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
  if (
    !entry.scope ||
    typeof entry.scope !== 'object' ||
    Array.isArray(entry.scope) ||
    Object.keys(entry.scope).length === 0
  ) {
    violations.push(
      createViolation(
        'technical-debt-scope',
        location,
        'Entry must define an exact structured scope.'
      )
    );
  }
}

function parseSource(context, relativePath) {
  return parseJson(absolute(context.root, relativePath));
}

function edgeDigest(edges) {
  const sorted = [...edges].sort(([leftFrom, leftTo], [rightFrom, rightTo]) =>
    `${leftFrom}\0${leftTo}`.localeCompare(`${rightFrom}\0${rightTo}`)
  );
  return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

function requireSourceLink(
  context,
  baselineEntry,
  classification,
  sourceKind,
  sourceKey,
  scope,
  file
) {
  context.requireLinkedEntry({
    ...context,
    baselineEntry,
    classification,
    sourceKind,
    sourceKey,
    scope,
    file,
  });
}

function validateArchitecture(context) {
  const file = 'tooling/configs/qa/architecture-debt.data.json';
  const baseline = parseSource(context, file);
  for (const entry of baseline.baselines ?? []) {
    requireSourceLink(
      context,
      entry,
      'debt',
      'architecture',
      entry.rule,
      { occurrences: entry.occurrences, rule: entry.rule },
      file
    );
  }
  return baseline.baselines?.length ?? 0;
}

function validateCodeql(context) {
  const file = 'tooling/configs/qa/codeql-baseline.json';
  const baseline = parseSource(context, file);
  for (const finding of baseline.findings ?? []) {
    requireSourceLink(
      context,
      finding,
      context.byId.get(finding.debtId)?.entry?.classification,
      'codeql',
      `${finding.rule}:${finding.file}:${finding.line}:${finding.contentHash}:${finding.messageHash}`,
      {
        contentHash: finding.contentHash,
        file: finding.file,
        line: finding.line,
        messageHash: finding.messageHash,
        rule: finding.rule,
      },
      file
    );
  }
  return baseline.findings?.length ?? 0;
}

function validateGitleaks(context) {
  const file = 'tooling/configs/qa/gitleaks-baseline.json';
  const baseline = parseSource(context, file);
  for (const finding of baseline.findings ?? []) {
    requireSourceLink(
      context,
      { debtId: finding.SniptaleDebtId },
      'tool-noise',
      'gitleaks',
      finding.Fingerprint,
      {
        commit: finding.Commit,
        file: finding.File,
        fingerprint: finding.Fingerprint,
        line: finding.StartLine,
        rule: finding.RuleID,
      },
      file
    );
  }
  return baseline.findings?.length ?? 0;
}

function validateScc(context) {
  const file = 'tooling/qa/guards/architecture/architecture-guardrails/scc-registry.data.json';
  const baseline = parseSource(context, file);
  for (const scc of baseline) {
    requireSourceLink(
      context,
      scc,
      scc.reason.startsWith('Allowed composition:') ? 'accepted-architecture' : 'debt',
      'scc',
      scc.id,
      { edgeDigest: edgeDigest(scc.edges), id: scc.id, owners: [...scc.owners].sort() },
      file
    );
  }
  return baseline.length;
}

function validateLicenses(context) {
  const file = 'tooling/configs/qa/licenses.json';
  const policy = parseSource(context, file);
  for (const exception of policy.reviewedExceptions ?? []) {
    requireSourceLink(
      context,
      exception,
      'accepted-architecture',
      'license',
      [
        `${exception.packageName}@${exception.resolvedVersion}`,
        exception.dependencyScope,
        exception.artifactInclusion,
        exception.licenseExpression,
      ].join(':'),
      {
        approvalOwner: exception.approvalOwner,
        artifactInclusion: exception.artifactInclusion,
        dependencyScope: exception.dependencyScope,
        expiresOn: exception.expiresOn,
        licenseExpression: exception.licenseExpression,
        packageName: exception.packageName,
        reason: exception.reason,
        resolvedVersion: exception.resolvedVersion,
      },
      file
    );
  }
  return policy.reviewedExceptions?.length ?? 0;
}

function validateQuality(context) {
  const file = 'tooling/configs/qa/quality-baseline.json';
  const baseline = parseSource(context, file);
  for (const allowance of baseline.allowances ?? []) {
    const scope = { file: allowance.file, rule: allowance.rule };
    if (allowance.line != null) scope.line = allowance.line;
    if (allowance.contentHash != null) scope.contentHash = allowance.contentHash;
    requireSourceLink(
      context,
      allowance,
      allowance.classification,
      'quality',
      `${allowance.rule}:${allowance.file}:${allowance.line ?? allowance.contentHash}`,
      scope,
      file
    );
  }
  return baseline.allowances?.length ?? 0;
}

function validateSonarjs(context) {
  const file = 'tooling/configs/qa/sonarjs-baseline.json';
  const baseline = parseSource(context, file);
  for (const entry of baseline.entries ?? []) {
    const scope = { file: entry.file, rule: entry.rule };
    if (entry.line != null) scope.line = entry.line;
    if (entry.messagePattern != null) scope.messagePattern = entry.messagePattern;
    requireSourceLink(
      context,
      entry,
      'tool-noise',
      'sonarjs',
      `${entry.rule}:${entry.file}:${entry.line ?? ''}:${entry.messagePattern ?? ''}`,
      scope,
      file
    );
  }
  return baseline.entries?.length ?? 0;
}

function validateEnforcedSources(context) {
  return (
    validateArchitecture(context) +
    validateCodeql(context) +
    validateGitleaks(context) +
    validateScc(context) +
    validateLicenses(context) +
    validateQuality(context) +
    validateSonarjs(context)
  );
}

function indexEntries(entries, violations) {
  const byId = new Map();
  const bySource = new Map();
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
    const sourceIdentity = `${entry?.source?.kind ?? ''}\0${entry?.source?.key ?? ''}`;
    if (bySource.has(sourceIdentity)) {
      violations.push(
        createViolation(
          'technical-debt-duplicate-source',
          TECHNICAL_DEBT_REGISTRY_PATH,
          `Duplicate debt source identity: ${entry?.source?.kind}:${entry?.source?.key}.`
        )
      );
    }
    bySource.set(sourceIdentity, entry?.id);
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

export function collectTechnicalDebtLinkViolations({
  root = repoRoot,
  today = new Date().toISOString().slice(0, 10),
  links,
} = {}) {
  const loaded = parseJson(absolute(root, TECHNICAL_DEBT_REGISTRY_PATH));
  const violations = [];
  const byId = indexEntries(loaded.entries ?? [], violations);
  for (const link of links ?? []) {
    const indexed = byId.get(link.debtId);
    if (indexed) validateEntryCommon(indexed.entry, indexed.index, violations, today);
    requireLinkedEntry({
      baselineEntry: { debtId: link.debtId },
      byId,
      classification: link.classification,
      sourceKind: link.sourceKind,
      sourceKey: link.sourceKey,
      scope: link.scope,
      file: link.file,
      violations,
    });
  }
  return violations;
}

export function collectTechnicalDebtRegistryViolations({
  root = repoRoot,
  today = new Date().toISOString().slice(0, 10),
  registry = null,
} = {}) {
  const loaded = registry ?? parseJson(absolute(root, TECHNICAL_DEBT_REGISTRY_PATH));
  const violations = [];
  if (
    Object.keys(loaded).sort().join(',') !== 'entries,schemaVersion' ||
    loaded.schemaVersion !== 2 ||
    !Array.isArray(loaded.entries)
  ) {
    return [
      createViolation(
        'technical-debt-schema',
        TECHNICAL_DEBT_REGISTRY_PATH,
        'Registry requires exact schemaVersion 2 with only compact debt entries.'
      ),
    ];
  }
  const byId = indexEntries(loaded.entries, violations);
  for (const [index, entry] of loaded.entries.entries())
    validateEntryCommon(entry, index, violations, today);
  const sourceContext = { byId, requireLinkedEntry, root, violations };
  const expectedCount = validateEnforcedSources(sourceContext);
  validateReferencedPopulation(loaded.entries, expectedCount, violations);
  return violations;
}
