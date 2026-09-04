import fs from 'node:fs';

import { readHeadFileTexts } from '../../analysis/git/git-head-sources.mjs';
import { classifyOwnerGroup } from '../../analysis/structural-risk/owner-classifier.mjs';

const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const MANIFEST_PATH = 'apps/extension/manifest.json';
const MANIFEST_PERMISSION_FIELDS = [
  'permissions',
  'optional_permissions',
  'host_permissions',
  'optional_host_permissions',
  'content_scripts',
  'web_accessible_resources',
  'sandbox',
  'content_security_policy',
];
const MANIFEST_RUNTIME_FIELDS = ['background', 'action', 'commands', 'offscreen_documents'];
const PERSISTENCE_PREFIX = 'apps/extension/src/composition/persistence/';
const PERSISTENCE_SCHEMA_PATTERN =
  /(?:schema-contracts|migration|migrations|database-version|domain-version|persisted-(?:codec|contract)|storage-version)/u;
const PERSISTENCE_MUTATION_PATTERN =
  /(?:mutation|write|save|delete|clone|transaction|store|database|indexed-db|browser-storage|index-mutations)/u;
const RUNTIME_CONTRACT_PATTERN =
  /^(?:packages\/runtime-contracts\/src\/|apps\/extension\/src\/contracts\/messaging\/)/u;
const IPC_WIRE_PATTERN =
  /^(?:packages\/runtime-contracts\/src\/messaging\/|apps\/extension\/src\/contracts\/messaging\/)/u;
const IPC_ROUTE_PATTERN =
  /^apps\/extension\/src\/(?:background\/.*(?:routing|routes)|contracts\/messaging\/.*background-ingress)/u;
const AUTHORIZATION_PATTERN = /(?:authorization|capabilit|sender-policy|permission-lifecycle)/u;
const AUTHORIZATION_ROOT_PATTERN =
  /^apps\/extension\/src\/(?:background\/.*routing|contracts\/messaging|platform\/security)/u;
const TRUSTED_EVENT_BRIDGE_PATTERN = new RegExp(
  '^apps/extension/src/(?:content/runtime/(?:ui-activation-bridge|.*trusted.*event)' +
    '|platform/browser/(?:.*event.*bridge))',
  'u'
);

const RISK_DEFINITIONS = Object.freeze({
  'manifest.permissions': {
    level: 'high',
    controls: ['Manifest permissions', 'Manifest integrity'],
    reviews: ['security'],
    docs: ['docs/security/manifest-permissions.md'],
    requirements: ['Security review', 'Permission compatibility proof'],
  },
  'manifest.runtime-topology': {
    level: 'high',
    controls: ['Manifest integrity', 'Runtime topology'],
    reviews: ['architecture'],
    docs: ['docs/architecture/runtime-contexts.md'],
    requirements: ['Architecture review', 'Runtime entrypoint compatibility check'],
  },
  'persistence.schema': {
    level: 'high',
    controls: ['Persistence ownership', 'Unit tests', 'Test coverage'],
    reviews: ['architecture'],
    docs: [
      'docs/architecture/persistence-contracts.md',
      'docs/architecture/storage-state-authority.md',
    ],
    requirements: ['Architecture review', 'Migration and backward compatibility test'],
  },
  'persistence.mutation': {
    level: 'medium',
    controls: ['Persistence ownership', 'Unit tests', 'Test coverage'],
    reviews: [],
    docs: ['docs/architecture/storage-state-authority.md'],
    requirements: ['Durable mutation failure and rollback proof'],
  },
  'runtime-contract.public': {
    level: 'high',
    controls: ['Package boundaries', 'Dependency boundaries', 'Typecheck', 'Unit tests'],
    reviews: ['architecture'],
    docs: ['docs/architecture/runtime-contexts.md'],
    requirements: ['Architecture review', 'Transitive consumer graph check'],
  },
  'ipc.wire-contract': {
    level: 'high',
    controls: ['Messaging', 'Typecheck', 'Unit tests'],
    reviews: ['architecture'],
    docs: ['docs/architecture/runtime-contexts.md'],
    requirements: ['Architecture review', 'Wire compatibility check'],
  },
  'ipc.route': {
    level: 'high',
    controls: ['Messaging', 'Runtime topology', 'Typecheck', 'Unit tests'],
    reviews: ['architecture'],
    docs: ['docs/architecture/runtime-contexts.md'],
    requirements: ['Architecture review', 'Route compatibility check'],
  },
  authorization: {
    level: 'high',
    controls: ['Messaging', 'Runtime topology', 'Unit tests'],
    reviews: ['security'],
    docs: ['docs/architecture/runtime-contexts.md'],
    requirements: ['Security review', 'Authorization negative proof'],
  },
  'trusted-event.bridge': {
    level: 'high',
    controls: ['Runtime topology', 'Unit tests', 'Test coverage'],
    reviews: ['security'],
    docs: ['docs/architecture/runtime-contexts.md', 'docs/security/data-handling.md'],
    requirements: [
      'Security review',
      'Trusted and untrusted event negative proof',
      'Registered-root boundary proof',
    ],
  },
});

function readCurrentText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function parseJson(text) {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function changedJsonFields(previous, current, fields) {
  if (previous === null || current === null) return fields;
  return fields.filter((field) => stableJson(previous[field]) !== stableJson(current[field]));
}

function createFinding(id, file, detail) {
  const definition = RISK_DEFINITIONS[id];
  return {
    id,
    level: definition.level,
    evidence: [{ file, detail }],
    controls: [...definition.controls],
    reviews: [...definition.reviews],
    docs: [...definition.docs],
    requirements: [...definition.requirements],
  };
}

function collectManifestFindings(file, mode, previousText, currentText) {
  if (file !== MANIFEST_PATH) return [];
  if (mode === 'preflight') {
    return [
      createFinding('manifest.permissions', file, 'manifest permission and exposure fields'),
      createFinding('manifest.runtime-topology', file, 'manifest runtime entrypoint fields'),
    ];
  }
  const previous = parseJson(previousText);
  const current = parseJson(currentText);
  const permissionFields = changedJsonFields(previous, current, MANIFEST_PERMISSION_FIELDS);
  const runtimeFields = changedJsonFields(previous, current, MANIFEST_RUNTIME_FIELDS);
  return [
    ...(permissionFields.length > 0
      ? [createFinding('manifest.permissions', file, permissionFields.join(', '))]
      : []),
    ...(runtimeFields.length > 0
      ? [createFinding('manifest.runtime-topology', file, runtimeFields.join(', '))]
      : []),
  ];
}

function collectPathFindings(file) {
  if (TEST_FILE_PATTERN.test(file)) return [];
  const findings = [];
  if (file.startsWith(PERSISTENCE_PREFIX)) {
    if (PERSISTENCE_SCHEMA_PATTERN.test(file)) {
      findings.push(
        createFinding('persistence.schema', file, 'persisted schema or migration owner')
      );
    } else if (PERSISTENCE_MUTATION_PATTERN.test(file)) {
      findings.push(createFinding('persistence.mutation', file, 'durable mutation owner'));
    }
  }
  if (RUNTIME_CONTRACT_PATTERN.test(file)) {
    findings.push(createFinding('runtime-contract.public', file, 'shared runtime contract owner'));
  }
  if (IPC_WIRE_PATTERN.test(file)) {
    findings.push(createFinding('ipc.wire-contract', file, 'cross-runtime messaging contract'));
  }
  if (IPC_ROUTE_PATTERN.test(file)) {
    findings.push(createFinding('ipc.route', file, 'runtime route or binding owner'));
  }
  if (AUTHORIZATION_ROOT_PATTERN.test(file) && AUTHORIZATION_PATTERN.test(file)) {
    findings.push(createFinding('authorization', file, 'authorization or capability owner'));
  }
  if (TRUSTED_EVENT_BRIDGE_PATTERN.test(file)) {
    findings.push(createFinding('trusted-event.bridge', file, 'trusted browser event bridge'));
  }
  return findings;
}

function mergeFindings(findings) {
  const merged = new Map();
  for (const finding of findings) {
    const existing = merged.get(finding.id);
    if (!existing) {
      merged.set(finding.id, finding);
      continue;
    }
    existing.evidence.push(...finding.evidence);
  }
  return [...merged.values()]
    .map((finding) => ({
      ...finding,
      evidence: [
        ...new Map(finding.evidence.map((item) => [`${item.file}\0${item.detail}`, item])).values(),
      ].sort(
        (left, right) =>
          left.file.localeCompare(right.file) || left.detail.localeCompare(right.detail)
      ),
      owners: [...new Set(finding.evidence.map(({ file }) => classifyOwnerGroup(file)))].sort(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function collectChangeRisks({ targetFiles = [], mode = 'checkpoint' } = {}) {
  const files = [...new Set(targetFiles)].sort();
  const previousSources = mode === 'checkpoint' ? readHeadFileTexts(files) : new Map();
  const findings = files.flatMap((file) => [
    ...collectManifestFindings(
      file,
      mode,
      previousSources.get(file) ?? null,
      readCurrentText(file)
    ),
    ...collectPathFindings(file),
  ]);
  return mergeFindings(findings);
}

export function collectRiskDocuments(findings) {
  return [...new Set(findings.flatMap((finding) => finding.docs))].sort();
}

export function collectRiskReviews(findings) {
  return [...new Set(findings.flatMap((finding) => finding.reviews))].sort();
}

export function resolveChangeRiskLevel(findings) {
  if (findings.some((finding) => finding.level === 'high')) return 'HIGH';
  if (findings.some((finding) => finding.level === 'medium')) return 'MEDIUM';
  return null;
}
