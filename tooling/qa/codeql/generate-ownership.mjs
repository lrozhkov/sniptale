import fs from 'node:fs';
import path from 'node:path';

import { isExecutedAsScript, repoRoot } from '../core/shared.mjs';

const STORAGE_POLICY_PATH = 'tooling/configs/qa/security-storage-ownership.data.json';
const NETWORK_POLICY_PATH = 'tooling/configs/qa/security-network-ownership.data.json';
export const CODEQL_OWNERSHIP_PATH = 'tooling/qa/codeql/lib/SniptaleOwnership.qll';

function collectPolicyEntries(policy, key) {
  return [...new Map((policy[key] ?? []).map((entry) => [entry.file, entry])).values()]
    .filter(
      (entry) => typeof entry.file === 'string' && entry.file && typeof entry.owner === 'string'
    )
    .sort((left, right) => left.file.localeCompare(right.file));
}

function formatFilePredicate(name, entries) {
  const files = entries.map((entry) => entry.file);
  if (files.length === 0)
    return [
      `predicate ${name}(File file) {`,
      '  exists(string path |',
      '    file.getRelativePath() = path and',
      '    1 = 0',
      '  )',
      '}',
    ].join('\n');
  if (files.length === 1)
    return [`predicate ${name}(File file) {`, `  file.getRelativePath() = "${files[0]}"`, '}'].join(
      '\n'
    );
  return [
    `predicate ${name}(File file) {`,
    '  file.getRelativePath() =',
    '    [',
    ...files.map((file, index) => `      "${file}"${index === files.length - 1 ? '' : ','}`),
    '    ]',
    '}',
  ].join('\n');
}

function collectGeneratedPolicyPredicates(storagePolicy, networkPolicy) {
  return [
    formatFilePredicate(
      'isAllowedSecretStorageOwner',
      collectPolicyEntries(storagePolicy, 'secretStorageOwners')
    ),
    formatFilePredicate(
      'isAllowedSensitiveRetentionOwner',
      collectPolicyEntries(storagePolicy, 'sensitiveRetentionOwners')
    ),
    formatFilePredicate(
      'isAllowedSecretHeaderOwner',
      collectPolicyEntries(networkPolicy, 'secretHeaderOwners')
    ),
    formatFilePredicate(
      'isAllowedCredentialedFetchOwner',
      collectPolicyEntries(networkPolicy, 'credentialedFetchOwners')
    ),
  ];
}

const STATIC_OWNERSHIP_QLL_SECTIONS = [
  [
    'predicate isAllowedParserSnapshotBoundaryOwner(File file) {',
    '  file.getRelativePath() =',
    '    [',
    '      "apps/extension/src/content/parser/export-manager-dom-driver.ts",',
    '      "apps/extension/src/content/parser/export-manager/diagnostics/dom-driver.ts",',
    '      "apps/extension/src/content/parser/export-manager/file-modal-utils.ts"',
    '    ]',
    '}',
  ],
  [
    'predicate isParserSnapshotSeam(File file) {',
    '  file.getRelativePath().regexpMatch("^apps/extension/src/content/parser/pipelines/.+\\\\.[cm]?[jt]sx?$")',
    '  or',
    '  file.getRelativePath().regexpMatch("^apps/extension/src/content/parser/' +
      'export-manager(?:/.+)?\\\\.[cm]?[jt]sx?$")',
    '}',
  ],
  [
    'predicate isStorageWriteCall(CallExpr call, string qualifiedName) {',
    '  exists(PropAccess callee |',
    '    callee = call.getCallee() and',
    '    qualifiedName = callee.getQualifiedName() and',
    '    qualifiedName =',
    '      [',
    '        "chrome.storage.local.set",',
    '        "chrome.storage.sync.set",',
    '        "chrome.storage.session.set",',
    '        "browserStorage.local.set",',
    '        "browserStorage.sync.set",',
    '        "browserStorage.session.set"',
    '      ]',
    '  )',
    '}',
  ],
  [
    'predicate isSecretLikeFieldName(string name) {',
    '  name = ["apiKey", "token", "secret", "authorization", "cookie"]',
    '}',
  ],
  [
    'predicate isSensitiveRetentionFieldName(string name) {',
    '  name =',
    '    [',
    '      "prompt",',
    '      "markdownData",',
    '      "jsonData",',
    '      "rawResponse",',
    '      "html",',
    '      "innerHtml",',
    '      "outerHtml",',
    '      "cookie",',
    '      "authorization"',
    '    ]',
    '}',
  ],
  [
    'predicate hasObjectArgument(CallExpr call, ObjectExpr objectArg) {',
    '  exists(int index |',
    '    index >= 0 and index < call.getNumArgument() and',
    '    objectArg = call.getArgument(index)',
    '  )',
    '}',
  ],
  [
    'predicate hasPropertyNamed(ObjectExpr objectExpr, string propertyName, Property property) {',
    '  property = objectExpr.getAProperty() and',
    '  property.getName() = propertyName',
    '}',
  ],
  [
    'predicate hasObjectPropertyNamed(ObjectExpr objectExpr, string propertyName, ObjectExpr value) {',
    '  exists(Property property |',
    '    hasPropertyNamed(objectExpr, propertyName, property) and',
    '    value = property.getInit()',
    '  )',
    '}',
  ],
].map((section) => section.join('\n'));

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function intersperseBlankLines(sections) {
  return sections.flatMap((section, index) =>
    index === sections.length - 1 ? [section] : [section, '']
  );
}

export function generateSniptaleOwnershipQll({
  storagePolicy = readJson(STORAGE_POLICY_PATH),
  networkPolicy = readJson(NETWORK_POLICY_PATH),
} = {}) {
  const predicates = collectGeneratedPolicyPredicates(storagePolicy, networkPolicy);

  return `${[
    '/* Generated by tooling/qa/codeql/generate-ownership.mjs. Do not edit by hand. */',
    'import javascript',
    '',
    ...predicates.flatMap((predicate) => [predicate, '']),
    ...intersperseBlankLines(STATIC_OWNERSHIP_QLL_SECTIONS),
  ].join('\n')}\n`;
}

export function assertGeneratedOwnershipQllIsFresh() {
  const expected = generateSniptaleOwnershipQll();
  const outputPath = path.join(repoRoot, CODEQL_OWNERSHIP_PATH);
  const actual = fs.readFileSync(outputPath, 'utf8');
  if (actual !== expected) {
    throw new Error(`Generated CodeQL ownership policy is stale: ${CODEQL_OWNERSHIP_PATH}`);
  }
}

if (isExecutedAsScript(import.meta.url)) {
  if (process.argv.includes('--check')) {
    assertGeneratedOwnershipQllIsFresh();
  } else {
    fs.writeFileSync(path.join(repoRoot, CODEQL_OWNERSHIP_PATH), generateSniptaleOwnershipQll());
  }
}
