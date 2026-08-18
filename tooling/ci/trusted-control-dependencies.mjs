import fs from 'node:fs';
import path from 'node:path';

const TRUSTED_NODE_MODULES = '/opt/sniptale-trusted/node_modules';

export function prepareTrustedControlDependencyMount({
  controlRoot,
  executionRoot,
  trustedCiRoot,
}) {
  if (!trustedCiRoot) return [];

  const candidateNodeModules = path.join(executionRoot, 'node_modules');
  fs.mkdirSync(candidateNodeModules, { recursive: true });
  fs.mkdirSync(path.join(controlRoot, 'node_modules'), { recursive: true });
  return ['--volume', `${candidateNodeModules}:${TRUSTED_NODE_MODULES}:ro`];
}
