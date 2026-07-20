import fs from 'node:fs';
import path from 'node:path';

const topologyPath = new URL('./runtime-topology.data.json', import.meta.url);
const TOPOLOGY_RELATIVE_PATH = 'tooling/qa/core/runtime-topology.data.json';

function escapeRegex(source) {
  return source.replace(/[|\\{}()[\]^$+*?.]/gu, '\\$&');
}

function readRuntimeTopologyData(rootDir) {
  const rootScopedPath = rootDir ? path.join(rootDir, TOPOLOGY_RELATIVE_PATH) : null;
  const sourcePath =
    rootScopedPath && fs.existsSync(rootScopedPath) ? rootScopedPath : topologyPath;
  return JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
}

/**
 * Returns the canonical runtime registry that QA must consume.
 */
export function getRuntimeTopology(rootDir) {
  return readRuntimeTopologyData(rootDir);
}

export function getRuntimeIds(rootDir) {
  return getRuntimeTopology(rootDir).map((runtime) => runtime.id);
}

export function getRuntimeRoots(rootDir) {
  return getRuntimeTopology(rootDir).map((runtime) => runtime.root);
}

export function getFeatureRuntimeRoots(rootDir = process.cwd()) {
  return getRuntimeTopology(rootDir)
    .filter((runtime) => runtime.featureRoot)
    .map((runtime) => path.join(rootDir, runtime.root));
}

export function getManifestOwnedRuntimeTopology(rootDir) {
  return getRuntimeTopology(rootDir).filter((runtime) => runtime.manifestOwned);
}

function createRuntimePathMatcher(runtimeRoots) {
  const prefixes = runtimeRoots.map((root) => `${root}/`);
  return {
    test(relativePath) {
      return prefixes.some((prefix) => relativePath.startsWith(prefix));
    },
  };
}

export function getEntrypointRuntimePathPattern() {
  return createRuntimePathMatcher(getRuntimeRoots());
}

export function getRuntimeRootPattern() {
  return createRuntimePathMatcher(getRuntimeRoots());
}

export function getRuntimeRootPatternSource(excludedRuntimeIds = []) {
  const escapedRoots = getRuntimeTopology()
    .filter((runtime) => !excludedRuntimeIds.includes(runtime.id))
    .map((runtime) => escapeRegex(runtime.root));
  return escapedRoots.length > 0 ? `^(?:${escapedRoots.join('|')})/` : '^$';
}

export function isRuntimeRelativePath(relativePath) {
  return getRuntimeRootPattern().test(relativePath);
}
