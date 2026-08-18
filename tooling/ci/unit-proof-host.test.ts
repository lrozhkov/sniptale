import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot, writeFile } from '../qa/core/test-helpers';
import { resolveReusableUnitProofHostPath } from './unit-proof-host.mjs';

it('admits only an existing regular host proof and degrades every other input to no reuse', () => {
  const root = createTempRoot('unit-proof-host-');
  const proof = writeFile(root, 'proof.json', '{}\n');
  const link = path.join(root, 'proof-link.json');
  fs.symlinkSync(proof, link);

  expect(resolveReusableUnitProofHostPath(proof)).toBe(proof);
  expect(resolveReusableUnitProofHostPath(path.join(root, 'missing.json'))).toBeNull();
  expect(resolveReusableUnitProofHostPath(root)).toBeNull();
  expect(resolveReusableUnitProofHostPath(link)).toBeNull();
});
