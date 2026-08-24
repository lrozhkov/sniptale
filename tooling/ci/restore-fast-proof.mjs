import fs from 'node:fs';
import path from 'node:path';

import { downloadSuccessfulMainProof } from './main-proof-transport.mjs';
import { verifyMainProof } from './verify-main-proof.mjs';

const [commit, destination] = process.argv.slice(2);
if (!commit || !destination) {
  throw new Error('Usage: restore-fast-proof.mjs <commit> <destination>');
}

const root = path.resolve(destination);
try {
  fs.mkdirSync(root, { recursive: false });
  downloadSuccessfulMainProof({ artifactRoot: root, commit });
  verifyMainProof(root, commit);
  process.stdout.write(`${root}\n`);
} catch (error) {
  fs.rmSync(root, { recursive: true, force: true });
  process.stderr.write(
    'Exact fast proof unavailable; release gate will execute the full product proof ' +
      `(${error instanceof Error ? error.message : String(error)}).\n`
  );
  process.exitCode = 1;
}
