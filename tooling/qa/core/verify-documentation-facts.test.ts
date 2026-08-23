import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  collectDocumentationFactViolations,
  isBackgroundIngressDataFile,
  renderDocumentationFacts,
} from './documentation-facts.mjs';
import { createTempRoot, writeFile } from './test-helpers';

const FIXTURE_FILES = [
  'tooling/configs/qa/documentation-facts.data.json',
  'package.json',
  'apps/extension/manifest.json',
  'tooling/configs/qa/manifest-permissions.data.json',
  'tooling/configs/ci/github-policy.json',
  'apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores.ts',
  'tooling/qa/core/runtime-topology.data.json',
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
});

it('rejects generated drift and alternate authored browser or reporting contradictions', () => {
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
  expect(collectDocumentationFactViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ file: 'README.md' }),
      expect.objectContaining({ file: 'docs/security/threat-model.md' }),
      expect.objectContaining({ file: 'docs/engineering/project-facts.md' }),
    ])
  );
});

it('fails closed when a registered authored consumer or required authority link is missing', () => {
  const root = createFixture();
  fs.rmSync(path.join(root, 'docs/oss/release.md'));
  writeFile(root, 'README.md', '# Sniptale\n');
  expect(collectDocumentationFactViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ file: 'docs/oss/release.md' }),
      expect.objectContaining({ file: 'README.md' }),
    ])
  );
});
