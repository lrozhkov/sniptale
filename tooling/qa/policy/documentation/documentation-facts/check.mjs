import fs from 'node:fs';
import path from 'node:path';

import { repoRoot } from '../../../analysis/repository/shared-paths.mjs';
import { QA_CONTROL_CATALOG } from '../../../composition/catalog/catalog.mjs';
import { collectRepositoryFiles } from '../../../analysis/git/git-fallback-repository.mjs';
import { collectAppCoreOwnerProjection } from '../../../guards/architecture/app-core/app-core-owner-policy.mjs';

export const DOCUMENTATION_FACTS_POLICY = 'tooling/configs/qa/documentation-facts.data.json';

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function readDatabaseVersion(root) {
  const source = fs.readFileSync(
    path.join(
      root,
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores.ts'
    ),
    'utf8'
  );
  const match = /^export const DB_VERSION = (\d+);$/mu.exec(source);
  if (!match) throw new Error('Unable to resolve DB_VERSION documentation authority.');
  return Number(match[1]);
}

function matchesForbiddenFact(source, kind) {
  const lines = source.split('\n').map((line) => line.toLowerCase());
  if (kind === 'browser-version-literal') {
    return lines.some(
      (line) =>
        line.includes('chrome') &&
        /\d/u.test(line) &&
        (line.includes('version') ||
          line.includes('+') ||
          line.includes('or newer') ||
          line.includes('or later'))
    );
  }
  if (kind === 'security-reporting-contradiction') {
    return lines.some(
      (line) =>
        (line.includes('security.md') && (line.includes(' no ') || line.includes('without'))) ||
        (line.includes('hosted') && line.includes('reporting') && line.includes('outside'))
    );
  }
  if (kind === 'persistence-current-version') {
    return lines.some((line) => {
      const currentIndex = line.indexOf('current');
      const versionIndex = line.indexOf('version', currentIndex);
      if (currentIndex < 0 || versionIndex < 0) return false;
      return /\d/u.test(line.slice(versionIndex, versionIndex + 48));
    });
  }
  if (kind === 'workflow-status-badge') {
    return source.includes('actions/workflows/provenance.yml/badge.svg');
  }
  throw new Error(`Unknown documentation fact contradiction kind: ${String(kind)}`);
}

function collectBackgroundOwnerModules(root) {
  const directory = path.join(root, 'apps/extension/src/contracts/messaging/contracts/runtime');
  const files = fs.readdirSync(directory).filter(isBackgroundIngressDataFile).sort();
  const owners = new Set();
  for (const file of files) {
    const source = fs.readFileSync(path.join(directory, file), 'utf8');
    for (const match of source.matchAll(/ownerModule:\s*'([^']+)'/gu)) owners.add(match[1]);
  }
  if (owners.size === 0) throw new Error('Background route owner authority is empty.');
  return [...owners].sort();
}

export function isBackgroundIngressDataFile(name) {
  const prefix = 'background-ingress';
  const suffix = '.data.ts';
  if (!name.startsWith(prefix) || !name.endsWith(suffix)) return false;
  const qualifier = name.slice(prefix.length, -suffix.length);
  return qualifier === '' || (qualifier.startsWith('.') && qualifier.length > 1);
}

function assertPolicy(policy) {
  const requiredIds = [
    'product-version',
    'minimum-browser-version',
    'manifest-capabilities',
    'security-reporting',
    'persistence-version',
    'runtime-topology',
    'background-route-owners',
    'release-policy',
    'qa-control-catalog',
  ];
  const ids = policy?.facts?.map(({ id }) => id);
  if (
    policy?.schemaVersion !== 3 ||
    policy.generatedDocument !== 'docs/engineering/project-facts.md' ||
    !Array.isArray(ids) ||
    JSON.stringify(ids) !== JSON.stringify(requiredIds) ||
    policy.facts.some(
      (fact) =>
        typeof fact.authority !== 'string' ||
        !Array.isArray(fact.consumers) ||
        fact.consumers.some((consumer) => typeof consumer !== 'string')
    ) ||
    !Array.isArray(policy.consumerAssertions) ||
    policy.consumerAssertions.length === 0 ||
    policy.consumerAssertions.some(
      (assertion) =>
        !ids.includes(assertion?.factId) ||
        typeof assertion.file !== 'string' ||
        !Array.isArray(assertion.mustContain) ||
        assertion.mustContain.length === 0 ||
        assertion.mustContain.some((value) => typeof value !== 'string' || value.length === 0) ||
        !Array.isArray(assertion.forbiddenKinds) ||
        assertion.forbiddenKinds.some(
          (value) =>
            ![
              'browser-version-literal',
              'persistence-current-version',
              'security-reporting-contradiction',
              'workflow-status-badge',
            ].includes(value)
        )
    )
  ) {
    throw new Error('Invalid documentation facts policy.');
  }
}

export function collectDocumentationFacts(root = repoRoot) {
  const policy = readJson(root, DOCUMENTATION_FACTS_POLICY);
  assertPolicy(policy);
  const packageJson = readJson(root, 'package.json');
  const manifest = readJson(root, 'apps/extension/manifest.json');
  const permissions = readJson(root, 'tooling/configs/qa/manifest-permissions.data.json');
  const githubPolicy = readJson(root, 'tooling/configs/ci/github-policy.json');
  const runtimeTopology = readJson(
    root,
    'tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json'
  );
  const requiredStatusChecks =
    githubPolicy.ruleset.rules
      .find(({ type }) => type === 'required_status_checks')
      ?.parameters.required_status_checks.map(({ context }) => context) ?? [];
  const qaControlCategoryCounts = new Map();
  for (const control of QA_CONTROL_CATALOG) {
    qaControlCategoryCounts.set(
      control.category,
      (qaControlCategoryCounts.get(control.category) ?? 0) + 1
    );
  }
  return {
    policy,
    productVersion: packageJson.version,
    minimumChromeVersion: manifest.minimum_chrome_version,
    permissions: permissions.permissions.map(({ name }) => name),
    optionalPermissions: (permissions.optionalPermissions ?? []).map(({ name }) => name),
    optionalHostPermissions: permissions.optionalHostPermissions.map(({ name }) => name),
    securityReporting: githubPolicy.security.privateVulnerabilityReporting
      ? '.github/SECURITY.md and GitHub private vulnerability reporting'
      : 'repository issue policy only',
    databaseVersion: readDatabaseVersion(root),
    runtimeTopology: runtimeTopology.map(({ id, root: runtimeRoot }) => ({
      id,
      root: runtimeRoot,
    })),
    backgroundOwnerModules: collectBackgroundOwnerModules(root),
    releasePolicy: {
      immutableReleases: githubPolicy.security.immutableReleases,
      requiredStatusChecks,
      releaseTagPattern: githubPolicy.releaseTagRuleset.conditions.ref_name.include.join(', '),
    },
    qaControlCatalog: {
      total: QA_CONTROL_CATALOG.length,
      categories: [...qaControlCategoryCounts].map(([category, count]) => ({ category, count })),
    },
    appCoreOwners: collectAppCoreOwnerProjection(collectRepositoryFiles(root)),
  };
}

function bullets(values) {
  return values.map((value) => `- \`${value}\``).join('\n');
}

function factRow(label, value, authority) {
  return `| ${label} | ${value} | \`${authority}\` |`;
}

export function renderDocumentationFacts(root = repoRoot) {
  const facts = collectDocumentationFacts(root);
  const checks =
    facts.releasePolicy.requiredStatusChecks.map((value) => `\`${value}\``).join(', ') || 'none';
  return [
    '<!-- Generated by tooling/qa/policy/documentation/generate-documentation-facts.mjs. Do not edit. -->',
    '# Generated project facts',
    '',
    'This file projects changeable values and inventories from their existing machine authorities. ' +
      'Authored documentation should link here and keep only decisions and rationale.',
    '',
    '| Fact | Current projection | Machine authority |',
    '| --- | --- | --- |',
    factRow('Product version', `\`${facts.productVersion}\``, 'package.json#/version'),
    factRow(
      'Minimum Chrome version',
      `\`${facts.minimumChromeVersion}\``,
      'apps/extension/manifest.json#/minimum_chrome_version'
    ),
    factRow(
      'Persistence database version',
      `\`${facts.databaseVersion}\``,
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores.ts#DB_VERSION'
    ),
    factRow(
      'Security reporting',
      facts.securityReporting,
      'tooling/configs/ci/github-policy.json#/security/privateVulnerabilityReporting'
    ),
    factRow(
      'Immutable GitHub Releases',
      `\`${facts.releasePolicy.immutableReleases}\``,
      'tooling/configs/ci/github-policy.json#/security/immutableReleases'
    ),
    factRow('Required GitHub checks', checks, 'tooling/configs/ci/github-policy.json#/ruleset'),
    factRow(
      'Protected release tags',
      `\`${facts.releasePolicy.releaseTagPattern}\``,
      'tooling/configs/ci/github-policy.json#/releaseTagRuleset'
    ),
    factRow(
      'QA controls',
      `\`${facts.qaControlCatalog.total}\` controls in ` +
        `\`${facts.qaControlCatalog.categories.length}\` ordered categories`,
      'tooling/qa/composition/catalog/catalog.mjs#QA_CONTROL_CATALOG'
    ),
    '',
    '## QA control categories',
    '',
    facts.qaControlCatalog.categories
      .map(({ category, count }) => `- \`${category}\`: ${count}`)
      .join('\n'),
    '',
    'The catalog owns control membership, order, scope, engine decision, normalized result, and ' +
      'proof metadata. Wrapper documentation must not restate an executable inventory.',
    '',
    '## App-core owner residency',
    '',
    'This inventory is projected from the live source tree. It is navigation data, not an allowlist or path gate.',
    '',
    bullets(facts.appCoreOwners),
    '',
    '## Manifest capabilities',
    '',
    'Required permissions:',
    '',
    bullets(facts.permissions),
    '',
    'Optional permissions:',
    '',
    bullets(facts.optionalPermissions),
    '',
    'Optional host permissions:',
    '',
    bullets(facts.optionalHostPermissions),
    '',
    'The ownership, justification, failure behavior, disclosure key, web-accessible resources, and ' +
      'content-script inventory remain in `tooling/configs/qa/manifest-permissions.data.json`.',
    '',
    '## Runtime topology',
    '',
    facts.runtimeTopology
      .map(({ id, root: runtimeRoot }) => `- \`${id}\` → \`${runtimeRoot}\``)
      .join('\n'),
    '',
    '## Background route owners',
    '',
    bullets(facts.backgroundOwnerModules),
    '',
    'The route registry remains the semantic authority for handler, authorization, policy-state, ' +
      'failure-shape, and mutation ownership. This projection is navigation aid only.',
    '',
  ].join('\n');
}

export function collectDocumentationFactViolations({ rootDir = repoRoot } = {}) {
  const facts = collectDocumentationFacts(rootDir);
  const generatedPath = path.join(rootDir, facts.policy.generatedDocument);
  const violations = [];
  if (
    !fs.existsSync(generatedPath) ||
    fs.readFileSync(generatedPath, 'utf8') !== renderDocumentationFacts(rootDir)
  ) {
    violations.push({
      rule: 'documentation-facts',
      file: facts.policy.generatedDocument,
      message: 'generated project facts drifted; run npm run docs:generate',
    });
  }
  return violations;
}

export function collectDocumentationProseAdvisories({ rootDir = repoRoot, targetFiles = [] } = {}) {
  const facts = collectDocumentationFacts(rootDir);
  const changedFiles = new Set(targetFiles);
  const advisories = [];
  for (const assertion of facts.policy.consumerAssertions.filter(({ file }) =>
    changedFiles.has(file)
  )) {
    const absolute = path.join(rootDir, assertion.file);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      advisories.push({
        rule: 'documentation-prose-drift',
        file: assertion.file,
        message: `registered ${assertion.factId} documentation consumer is missing`,
      });
      continue;
    }
    const source = fs.readFileSync(absolute, 'utf8');
    const missing = assertion.mustContain.filter((value) => !source.includes(value));
    const forbidden = assertion.forbiddenKinds.filter((kind) => matchesForbiddenFact(source, kind));
    if (missing.length > 0 || forbidden.length > 0) {
      advisories.push({
        rule: 'documentation-prose-drift',
        file: assertion.file,
        message: `registered ${assertion.factId} consumer drifted from its machine-owned fact`,
      });
    }
  }
  return advisories;
}
