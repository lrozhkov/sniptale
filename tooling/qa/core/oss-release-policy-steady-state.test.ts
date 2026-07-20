import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { sha256 } from '../../release/oss-release-policy.mjs';
import { validateDocuments } from './oss-release-validation.docs.mjs';
import { validateLegalFiles } from './oss-release-validation.policy.mjs';
import { createTempRoot } from './test-helpers';

function write(root: string, relativePath: string, contents: string) {
  const destination = path.join(root, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

function contributionFixture() {
  const root = createTempRoot('oss-release-contribution-policy-');
  const workflow = '`implementation → qa:checkpoint → required review → qa:closeout`\n';
  for (const relativePath of [
    'AGENTS.md',
    'docs/tooling/code-quality.md',
    'docs/tooling/wrapper-summary.md',
  ]) {
    write(root, relativePath, workflow);
  }
  write(root, 'README.md', 'Sniptale\n');
  write(root, 'CODE_OF_CONDUCT.md', 'Enforcement owner: Lev Rozhkov\n');
  write(
    root,
    'docs/oss/release.md',
    'qa:release-harness qa:checkpoint qa:release qa:audit Corresponding Source AGPL-3.0-or-later\n'
  );
  return {
    policy: {
      contributorFiles: ['README.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md'],
      forbiddenReleaseDocFragments: [],
      releaseDocs: ['docs/oss/release.md'],
    },
    root,
  };
}

it('accepts one canonical legal file referenced by bundled and dependency policy', () => {
  const root = createTempRoot('oss-release-legal-dedup-');
  const manifest = JSON.stringify({
    entries: [{ archivePath: 'LICENSES/OFL-1.1.txt' }],
    schemaVersion: 1,
  });
  const legal = new Map([
    ['LICENSE', readFileSync(path.resolve('LICENSE'), 'utf8')],
    ['LICENSES/OFL-1.1.txt', readFileSync(path.resolve('LICENSES/OFL-1.1.txt'), 'utf8')],
    ['NOTICE', 'notice\n'],
    ['THIRD_PARTY_NOTICES.md', 'notices\n'],
    ['THIRD_PARTY_DEPENDENCIES.json', manifest],
  ]);
  for (const [relativePath, contents] of legal) write(root, relativePath, contents);
  const policy = {
    legalFiles: [...legal].map(([source, contents]) => ({
      archivePath: source,
      sha256: sha256(Buffer.from(contents)),
      source,
    })),
    dependencyLegal: { manifestPath: 'THIRD_PARTY_DEPENDENCIES.json' },
  };

  expect(validateLegalFiles(root, policy)).toEqual([]);
});

it('requires the closed external contribution policy and conduct owner', () => {
  const { policy, root } = contributionFixture();
  write(root, 'CONTRIBUTING.md', 'Contributions are AGPL-3.0-or-later.\n');

  expect(validateDocuments(root, policy)).toContain(
    'external contribution policy or conduct enforcement owner is incomplete'
  );
  write(
    root,
    'CONTRIBUTING.md',
    [
      'Sniptale welcomes bug reports.',
      'Sniptale does not currently accept external code contributions.',
      'Patches and pull requests may be closed.\n',
    ].join(' ')
  );
  expect(validateDocuments(root, policy)).toEqual([]);

  write(
    root,
    'CONTRIBUTING.md',
    [
      'Sniptale welcomes bug reports.',
      'Sniptale does not currently accept external code contributions.',
      'Patches and pull requests may be closed.',
      'Sniptale accepts external code contributions and pull requests.\n',
    ].join(' ')
  );
  expect(validateDocuments(root, policy)).toContain(
    'external contribution policy or conduct enforcement owner is incomplete'
  );
});
