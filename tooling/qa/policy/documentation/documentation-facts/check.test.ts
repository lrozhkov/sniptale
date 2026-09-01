import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  collectDocumentationFactViolations,
  collectDocumentationProseAdvisories,
  isBackgroundIngressDataFile,
  renderDocumentationFacts,
} from './check.mjs';
import { QA_CONTROL_CATALOG } from '../../../composition/catalog/catalog.mjs';
import { createTempRoot, writeFile } from '../../../test-support/test-helpers';

const FIXTURE_FILES = [
  'tooling/configs/qa/documentation-facts.data.json',
  'package.json',
  'apps/extension/manifest.json',
  'tooling/configs/qa/manifest-permissions.data.json',
  'tooling/configs/ci/github-policy.json',
  'apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores.ts',
  'tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json',
  'README.md',
  'docs/architecture/persistence-contracts.md',
  'docs/security/threat-model.md',
  'docs/oss/provenance.md',
  'docs/oss/release.md',
];

function createFixture() {
  const root = createTempRoot('documentation-facts-');
  for (const file of FIXTURE_FILES) {
    writeFile(root, file, fs.readFileSync(file, 'utf8'));
  }
  const routeRoot = 'apps/extension/src/contracts/messaging/contracts/runtime';
  for (const file of fs.readdirSync(routeRoot).filter(isBackgroundIngressDataFile)) {
    writeFile(
      root,
      path.join(routeRoot, file),
      fs.readFileSync(path.join(routeRoot, file), 'utf8')
    );
  }
  writeFile(root, 'docs/engineering/project-facts.md', renderDocumentationFacts(root));
  return root;
}

it('accepts the exact generated projection of every registered authority', () => {
  const root = createFixture();
  expect(collectDocumentationFactViolations({ rootDir: root })).toEqual([]);
  expect(renderDocumentationFacts(root)).toContain(
    `| QA controls | \`${QA_CONTROL_CATALOG.length}\` controls in `
  );
});

it('blocks generated drift but reports authored wording heuristics as diff-only advisory', () => {
  const root = createFixture();
  writeFile(
    root,
    'README.md',
    `${fs.readFileSync(path.join(root, 'README.md'), 'utf8')}\nRequires Chrome version 147+.\n`
  );
  writeFile(
    root,
    'docs/security/threat-model.md',
    `${fs.readFileSync(path.join(root, 'docs/security/threat-model.md'), 'utf8')}\n` +
      'Hosted security reporting remains outside the project.\n'
  );
  writeFile(root, 'docs/engineering/project-facts.md', '# stale\n');
  expect(collectDocumentationFactViolations({ rootDir: root })).toEqual([
    expect.objectContaining({ file: 'docs/engineering/project-facts.md' }),
  ]);
  expect(
    collectDocumentationProseAdvisories({
      rootDir: root,
      targetFiles: ['README.md', 'docs/security/threat-model.md'],
    })
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ file: 'README.md' }),
      expect.objectContaining({ file: 'docs/security/threat-model.md' }),
    ])
  );
});

it('keeps missing authored consumers advisory and limited to the current diff', () => {
  const root = createFixture();
  fs.rmSync(path.join(root, 'docs/oss/release.md'));
  writeFile(root, 'README.md', '# Sniptale\n');
  expect(collectDocumentationFactViolations({ rootDir: root })).toEqual([]);
  expect(
    collectDocumentationProseAdvisories({
      rootDir: root,
      targetFiles: ['docs/oss/release.md', 'README.md'],
    })
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ file: 'docs/oss/release.md' }),
      expect.objectContaining({ file: 'README.md' }),
    ])
  );
  expect(collectDocumentationProseAdvisories({ rootDir: root, targetFiles: [] })).toEqual([]);
});
