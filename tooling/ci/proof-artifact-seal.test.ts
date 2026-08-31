import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot, writeFile } from '../qa/test-support/test-helpers';
import { sealVerifiedProofFiles } from './proof-artifact-seal.mjs';

const FIRST_DIGEST = '06f961b802bc46ee168555f066d28f4f0e9afdf3f88174c1ee6f9de004fc30a0';
const SECOND_DIGEST = 'c0cde77fa8fef97d476c10aad3d2d54fcc2f336140d073651c2dcccf1e379fd6';

function createFixture() {
  const root = createTempRoot('proof-artifact-seal-');
  const destinationRoot = createTempRoot('sealed-proof-artifact-');
  writeFile(root, 'proof/first.json', 'A\n');
  writeFile(root, 'proof/second.json', 'B\n');
  return {
    destinationRoot,
    manifest: {
      files: [
        { file: 'proof/first.json', sha256: FIRST_DIGEST },
        { file: 'proof/second.json', sha256: SECOND_DIGEST },
      ],
    },
    root,
  };
}

it('seals every selected regular file to its verified manifest digest', () => {
  const { destinationRoot, manifest, root } = createFixture();
  const first = path.join(destinationRoot, 'first.json');
  const second = path.join(destinationRoot, 'second.json');

  expect(
    sealVerifiedProofFiles(root, manifest, [
      { relativePath: 'proof/first.json', destination: first },
      { relativePath: 'proof/second.json', destination: second },
    ])
  ).toEqual([first, second]);
  expect(fs.readFileSync(first, 'utf8')).toBe('A\n');
  expect(fs.readFileSync(second, 'utf8')).toBe('B\n');
});

it('rejects duplicate manifest identities and rolls back a digest-mismatched group', () => {
  const duplicate = createFixture();
  duplicate.manifest.files.push(duplicate.manifest.files[0]);
  expect(() =>
    sealVerifiedProofFiles(duplicate.root, duplicate.manifest, [
      {
        relativePath: 'proof/first.json',
        destination: path.join(duplicate.destinationRoot, 'first.json'),
      },
    ])
  ).toThrow('does not seal exactly one');

  const drifted = createFixture();
  drifted.manifest.files[1].sha256 = 'a'.repeat(64);
  const first = path.join(drifted.destinationRoot, 'first.json');
  const second = path.join(drifted.destinationRoot, 'second.json');
  expect(() =>
    sealVerifiedProofFiles(drifted.root, drifted.manifest, [
      { relativePath: 'proof/first.json', destination: first },
      { relativePath: 'proof/second.json', destination: second },
    ])
  ).toThrow('artifact digest drifted');
  expect(fs.existsSync(first)).toBe(false);
  expect(fs.existsSync(second)).toBe(false);
});

it('rejects a manifest-selected path outside the verified artifact root', () => {
  const { destinationRoot, manifest, root } = createFixture();
  manifest.files.push({ file: '../outside.json', sha256: FIRST_DIGEST });

  expect(() =>
    sealVerifiedProofFiles(root, manifest, [
      {
        relativePath: '../outside.json',
        destination: path.join(destinationRoot, 'outside.json'),
      },
    ])
  ).toThrow('Unsafe verified proof artifact path');
});
