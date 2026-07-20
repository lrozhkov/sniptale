import path from 'node:path';

import { QUALITY_BASELINE_PATH } from './quality.config.mjs';

export function getBaselinePath(repoRoot) {
  return path.join(repoRoot, QUALITY_BASELINE_PATH);
}
