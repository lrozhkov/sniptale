import fs from 'node:fs';
import path from 'node:path';

const topologyPath = new URL('./runtime-topology.data.json', import.meta.url);
const TOPOLOGY_RELATIVE_PATH =
  'tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json';
const RUNTIME_KEYS = new Set([
  'docsMarkers',
  'entrypointFiles',
  'featureRoot',
  'id',
  'manifestOwned',
  'root',
]);

function escapeRegex(source) {
  return source.replace(/[|\\{}()[\]^$+*?.]/gu, '\\$&');
}

function readRuntimeTopologyData(rootDir) {
  const rootScopedPath = rootDir ? path.join(rootDir, TOPOLOGY_RELATIVE_PATH) : null;
  const sourcePath =
    rootScopedPath && fs.existsSync(rootScopedPath) ? rootScopedPath : topologyPath;
  return JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
}

function requireUniqueStringArray(value, field, runtimeId) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((entry) => typeof entry !== 'string' || entry.length === 0)
  ) {
    throw new Error(`Runtime "${runtimeId}" ${field} must be a non-empty string array.`);
  }
  if (new Set(value).size !== value.length) {
    throw new Error(`Runtime "${runtimeId}" ${field} contains duplicates.`);
  }
  return value;
}

function parseRuntime(runtime, index) {
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) {
    throw new Error(`Runtime topology row ${index} must be an object.`);
  }
  const unknownKeys = Object.keys(runtime).filter((key) => !RUNTIME_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`Runtime topology row ${index} has unknown keys: ${unknownKeys.join(', ')}.`);
  }
  if (typeof runtime.id !== 'string' || !/^[a-z][a-z0-9-]*$/u.test(runtime.id)) {
    throw new Error(`Runtime topology row ${index} has an invalid id.`);
  }
  if (typeof runtime.root !== 'string' || !/^apps\/extension\/src\/[^/]+$/u.test(runtime.root)) {
    throw new Error(`Runtime "${runtime.id}" has an invalid runtime root.`);
  }
  if (typeof runtime.manifestOwned !== 'boolean' || typeof runtime.featureRoot !== 'boolean') {
    throw new Error(`Runtime "${runtime.id}" ownership flags must be booleans.`);
  }

  return {
    docsMarkers: requireUniqueStringArray(runtime.docsMarkers, 'docsMarkers', runtime.id),
    entrypointFiles: requireUniqueStringArray(
      runtime.entrypointFiles,
      'entrypointFiles',
      runtime.id
    ),
    featureRoot: runtime.featureRoot,
    id: runtime.id,
    manifestOwned: runtime.manifestOwned,
    root: runtime.root,
  };
}

function assertUniqueRuntimeField(topology, field) {
  const values = topology.flatMap((runtime) =>
    Array.isArray(runtime[field]) ? runtime[field] : [runtime[field]]
  );
  if (new Set(values).size !== values.length) {
    throw new Error(`Runtime topology contains duplicate ${field} values.`);
  }
}

export function parseRuntimeTopology(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Runtime topology must be a non-empty array.');
  }
  const topology = value.map(parseRuntime);
  for (const field of ['id', 'root', 'entrypointFiles', 'docsMarkers']) {
    assertUniqueRuntimeField(topology, field);
  }
  return topology;
}

/**
 * Returns the canonical runtime registry that QA must consume.
 */
export function getRuntimeTopology(rootDir) {
  return readRuntimeTopologyData(rootDir);
}

export function getValidatedRuntimeTopology(rootDir) {
  return parseRuntimeTopology(readRuntimeTopologyData(rootDir));
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
