import {
  collectImportEdges,
  isProductionImportTarget,
} from './architecture-guardrails.helpers.mjs';
import { toRelativePath } from './shared.mjs';
import { getRuntimeRoots } from './runtime-topology.mjs';

const APP_CORE_OWNERS = new Set([
  'composition',
  'contracts',
  'features',
  'foundation',
  'platform',
  'ui',
  'workflows',
]);
const OWNER_TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;

function appCoreOwner(path) {
  const match = /^apps\/extension\/src\/([^/]+)/u.exec(path);
  return match && APP_CORE_OWNERS.has(match[1]) ? match[1] : null;
}

function runtimeOwner(path, roots) {
  return roots.find((root) => path === root || path.startsWith(`${root}/`)) ?? null;
}

export function ownerTestEdgeErrors(root, codeFiles) {
  const runtimeRoots = getRuntimeRoots(root);
  const testFiles = codeFiles.filter((file) => OWNER_TEST_FILE_PATTERN.test(toRelativePath(file)));
  return collectImportEdges(testFiles, { root })
    .filter((edge) => isProductionImportTarget(edge.to))
    .flatMap((edge) => {
      const from = toRelativePath(edge.from);
      const to = toRelativePath(edge.to);
      return appCoreOwner(from) && runtimeOwner(to, runtimeRoots)
        ? [`app-core owner test imports runtime implementation: ${from} -> ${to}`]
        : [];
    });
}
