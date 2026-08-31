import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot } from '../qa/test-support/test-helpers';
import {
  resolveReusableBuildProofHostPaths,
  resolveReusableCodeqlProofHostPaths,
  resolveReusableCoverageProofHostPaths,
  resolveReusableUnitProofHostPath,
} from './proof-host-inputs.mjs';

it('admits only regular non-symlink proof files and exact coverage directories', () => {
  const root = createTempRoot('proof-host-inputs-');
  const proof = path.join(root, 'proof.json');
  const archive = path.join(root, 'archive.zip');
  const sarif = path.join(root, 'results.sarif');
  const reports = path.join(root, 'coverage');
  const link = path.join(root, 'proof-link.json');
  fs.writeFileSync(proof, '{}');
  fs.writeFileSync(archive, 'zip');
  fs.writeFileSync(sarif, '{}');
  fs.mkdirSync(reports);
  fs.symlinkSync(proof, link);

  expect(resolveReusableUnitProofHostPath(proof)).toBe(proof);
  expect(resolveReusableBuildProofHostPaths({ proofPath: proof, archivePath: archive })).toEqual({
    proof,
    archive,
  });
  expect(resolveReusableCodeqlProofHostPaths({ proofPath: proof, sarifPath: sarif })).toEqual({
    proof,
    sarif,
  });
  expect(resolveReusableCoverageProofHostPaths({ proofPath: proof, reportsPath: reports })).toEqual(
    {
      proof,
      reports,
    }
  );

  for (const invalid of [undefined, path.join(root, 'missing'), root, link]) {
    expect(resolveReusableUnitProofHostPath(invalid)).toBeNull();
  }
  expect(resolveReusableBuildProofHostPaths({ proofPath: link, archivePath: archive })).toBeNull();
  expect(resolveReusableBuildProofHostPaths({ proofPath: proof, archivePath: reports })).toBeNull();
  expect(resolveReusableCodeqlProofHostPaths({ proofPath: proof, sarifPath: reports })).toBeNull();
  expect(resolveReusableCodeqlProofHostPaths({ proofPath: proof })).toBeNull();
  expect(
    resolveReusableCoverageProofHostPaths({ proofPath: proof, reportsPath: sarif })
  ).toBeNull();
  expect(
    resolveReusableCoverageProofHostPaths({ proofPath: link, reportsPath: reports })
  ).toBeNull();
});
