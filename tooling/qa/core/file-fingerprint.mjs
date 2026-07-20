import crypto from 'node:crypto';
import fs from 'node:fs';

import { fromRelativePath } from './shared.mjs';

export function createFileContentFingerprint(files = []) {
  const hash = crypto.createHash('sha256');

  for (const relativePath of [...files].sort()) {
    hash.update(relativePath);
    hash.update('\0');

    const absolutePath = fromRelativePath(relativePath);
    if (!fs.existsSync(absolutePath)) {
      hash.update('missing');
      hash.update('\0');
      continue;
    }

    hash.update('present');
    hash.update('\0');
    hash.update(fs.readFileSync(absolutePath));
    hash.update('\0');
  }

  return hash.digest('hex');
}
