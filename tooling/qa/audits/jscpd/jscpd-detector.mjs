import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { repoRoot } from '../../analysis/repository/shared-paths.mjs';

export const JSCPD_ENGINE_VERSION = '5.0.16';
export const JSCPD_NORMALIZATION_SCHEMA_VERSION = 2;
export const JSCPD_WORKERS = 2;

const require = createRequire(import.meta.url);
const FORMAT_EXTENSIONS = new Set([
  'bash',
  'cjs',
  'css',
  'html',
  'htm',
  'js',
  'jsx',
  'less',
  'mjs',
  'mts',
  'cts',
  'scss',
  'sh',
  'ts',
  'tsx',
  'yaml',
  'yml',
]);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeReportedPath(filePath, root) {
  const raw = String(filePath ?? '').replaceAll('\\', '/');
  const normalizedRoot = String(root).replaceAll('\\', '/').replace(/\/$/u, '');
  let relative = raw;
  if (path.isAbsolute(raw) || /^[A-Za-z]:\//u.test(raw)) {
    if (!raw.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)) {
      throw new Error(`jscpd report path is outside the repository: ${raw}`);
    }
    relative = raw.slice(normalizedRoot.length + 1);
  }
  relative = relative.replace(/^\.\//u, '');
  if (!relative || relative === '..' || relative.startsWith('../') || relative.includes('/../')) {
    throw new Error(`jscpd report path is not repository-relative: ${raw}`);
  }
  return relative;
}

function normalizeLocation(location, fallbackLine) {
  if (!location || typeof location !== 'object' || Array.isArray(location)) {
    throw new Error('jscpd clone endpoint requires startLoc and endLoc');
  }
  const normalized = {
    line: location.line,
    column: location.column,
    position: location.position,
  };
  if (
    !Number.isInteger(normalized.line) ||
    normalized.line < 1 ||
    !Number.isInteger(normalized.column) ||
    normalized.column < 0 ||
    !Number.isInteger(normalized.position) ||
    normalized.position < 0 ||
    normalized.line !== fallbackLine
  ) {
    throw new Error('jscpd clone endpoint contains an invalid source location');
  }
  return normalized;
}

function normalizeEndpoint(endpoint, root) {
  if (!endpoint || typeof endpoint !== 'object' || Array.isArray(endpoint)) {
    throw new Error('jscpd clone requires two file endpoints');
  }
  if (!Number.isInteger(endpoint.start) || endpoint.start < 1) {
    throw new Error('jscpd clone endpoint requires a positive start line');
  }
  if (!Number.isInteger(endpoint.end) || endpoint.end < endpoint.start) {
    throw new Error('jscpd clone endpoint requires an ordered end line');
  }
  return {
    path: normalizeReportedPath(endpoint.name, root),
    start: endpoint.start,
    end: endpoint.end,
    startLoc: normalizeLocation(endpoint.startLoc, endpoint.start),
    endLoc: normalizeLocation(endpoint.endLoc, endpoint.end),
  };
}

function endpointKey(endpoint) {
  return [
    endpoint.path,
    endpoint.start,
    endpoint.end,
    endpoint.startLoc.column,
    endpoint.endLoc.column,
    endpoint.startLoc.position,
    endpoint.endLoc.position,
  ].join('\0');
}

export function normalizeJscpdClone(duplicate, { root }) {
  if (!duplicate || typeof duplicate !== 'object' || Array.isArray(duplicate)) {
    throw new Error('jscpd duplicate must be an object');
  }
  if (typeof duplicate.format !== 'string' || duplicate.format.length === 0) {
    throw new Error('jscpd duplicate requires a format');
  }
  if (!Number.isInteger(duplicate.lines) || duplicate.lines < 1) {
    throw new Error('jscpd duplicate requires positive lines');
  }
  if (!Number.isInteger(duplicate.tokens) || duplicate.tokens < 1) {
    throw new Error('jscpd duplicate requires positive tokens');
  }
  const endpoints = [
    normalizeEndpoint(duplicate.firstFile, root),
    normalizeEndpoint(duplicate.secondFile, root),
  ].sort((left, right) => endpointKey(left).localeCompare(endpointKey(right)));
  const clone = {
    format: duplicate.format,
    lines: duplicate.lines,
    tokens: duplicate.tokens,
    firstFile: endpoints[0],
    secondFile: endpoints[1],
  };
  const pairKey = sha256(
    JSON.stringify({
      format: clone.format,
      firstFile: { path: clone.firstFile.path, start: clone.firstFile.start },
      secondFile: { path: clone.secondFile.path, start: clone.secondFile.start },
    })
  );
  return { id: sha256(JSON.stringify(clone)), pairKey, ...clone };
}

export function normalizeJscpdClones(duplicates, options) {
  const byId = new Map();
  for (const duplicate of duplicates) {
    const clone = normalizeJscpdClone(duplicate, options);
    if (byId.has(clone.id)) {
      throw new Error(`jscpd report contains duplicate clone id: ${clone.id}`);
    }
    byId.set(clone.id, clone);
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizePath(filePath) {
  return String(filePath).replaceAll('\\', '/').replace(/^\.\//u, '');
}

function selectedPlatformPackage() {
  if (process.platform === 'darwin' && ['x64', 'arm64'].includes(process.arch)) {
    return `jscpd-darwin-${process.arch}`;
  }
  if (process.platform === 'win32' && process.arch === 'x64') {
    return 'jscpd-windows-x64-msvc';
  }
  if (process.platform === 'linux' && ['x64', 'arm64'].includes(process.arch)) {
    const glibc = process.report?.getReport?.()?.header?.glibcVersionRuntime;
    if (process.arch === 'arm64' && !glibc) return null;
    return `jscpd-linux-${process.arch}-${glibc ? 'gnu' : 'musl'}`;
  }
  return null;
}

export function readJscpdPlatformClosure({ root = repoRoot } = {}) {
  const lock = readJson(path.join(root, 'package-lock.json'));
  const rootRange = lock.packages?.['']?.devDependencies?.jscpd;
  const engine = lock.packages?.['node_modules/jscpd'];
  if (rootRange !== JSCPD_ENGINE_VERSION || engine?.version !== JSCPD_ENGINE_VERSION) {
    throw new Error(`jscpd must be pinned exactly to ${JSCPD_ENGINE_VERSION}`);
  }
  const platformPackages = Object.entries(engine.optionalDependencies ?? {})
    .map(([name, version]) => {
      const locked = lock.packages?.[`node_modules/${name}`];
      if (version !== JSCPD_ENGINE_VERSION || locked?.version !== JSCPD_ENGINE_VERSION) {
        throw new Error(`jscpd platform package ${name} must resolve to ${JSCPD_ENGINE_VERSION}`);
      }
      return { name, version: locked.version, integrity: locked.integrity };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  if (platformPackages.length !== 6 || platformPackages.some((entry) => !entry.integrity)) {
    throw new Error('jscpd platform closure must contain six integrity-pinned native packages');
  }
  return {
    engineVersion: engine.version,
    platformPackages,
    platformPackagesDigest: sha256(JSON.stringify(platformPackages)),
  };
}

export function resolveJscpdNativeRuntime({ root = repoRoot } = {}) {
  const platformPackage = selectedPlatformPackage();
  if (!platformPackage) {
    throw new Error(`jscpd 5 does not support ${process.platform}/${process.arch}`);
  }
  const closure = readJscpdPlatformClosure({ root });
  const admitted = closure.platformPackages.find((entry) => entry.name === platformPackage);
  if (!admitted) throw new Error(`jscpd platform package is not admitted: ${platformPackage}`);
  let packageJsonPath;
  try {
    packageJsonPath = require.resolve(`${platformPackage}/package.json`, { paths: [root] });
  } catch (error) {
    throw new Error(`jscpd platform package is not installed: ${platformPackage}`, {
      cause: error,
    });
  }
  const installed = readJson(packageJsonPath);
  if (installed.version !== JSCPD_ENGINE_VERSION) {
    throw new Error(`jscpd platform package has unexpected version: ${installed.version}`);
  }
  const executable = path.join(
    path.dirname(packageJsonPath),
    'bin',
    process.platform === 'win32' ? 'jscpd.exe' : 'jscpd'
  );
  if (!fs.existsSync(executable)) throw new Error(`jscpd native binary is missing: ${executable}`);
  return {
    ...closure,
    executable,
    platformPackage,
    binaryDigest: sha256(fs.readFileSync(executable)),
  };
}

function isIgnoredJscpdPath(relativePath) {
  const basename = path.posix.basename(relativePath);
  return (
    /\.(?:test|spec)\./u.test(basename) ||
    /\.(?:test-support|test-helpers)\./u.test(basename) ||
    basename.startsWith('test-support.') ||
    relativePath.includes('/test-support/') ||
    /\.(?:data|constants)\./u.test(basename) ||
    relativePath.startsWith('tooling/test/') ||
    relativePath.startsWith('apps/extension/src/platform/i18n/')
  );
}

export function collectJscpdScanPopulation({ root = repoRoot, scanTargets }) {
  const roots = [...scanTargets].map(normalizePath).sort();
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '--', ...roots],
    { cwd: root, encoding: 'utf8' }
  );
  const files = output
    .split(/\r?\n/u)
    .filter(Boolean)
    .map(normalizePath)
    .filter((file) =>
      roots.some((scanRoot) => file === scanRoot || file.startsWith(`${scanRoot}/`))
    )
    .filter((file) => FORMAT_EXTENSIONS.has(path.posix.extname(file).slice(1).toLowerCase()))
    .filter((file) => !isIgnoredJscpdPath(file))
    .filter((file) => fs.existsSync(path.join(root, file)))
    .filter((file) => fs.statSync(path.join(root, file)).size <= 1024 * 1024)
    .sort();
  return {
    count: files.length,
    digest: sha256(files.join('\0')),
    roots,
  };
}

export function createJscpdDetectorIdentity({
  configPath,
  controlRoot = repoRoot,
  executionKind = 'native',
  root = repoRoot,
  runtime = resolveJscpdNativeRuntime({ root: controlRoot }),
  scanTargets,
  workers = JSCPD_WORKERS,
}) {
  const absoluteConfig = path.isAbsolute(configPath) ? configPath : path.join(root, configPath);
  const population = collectJscpdScanPopulation({ root, scanTargets });
  return {
    engine: 'jscpd',
    engineVersion: runtime.engineVersion,
    normalizationSchemaVersion: JSCPD_NORMALIZATION_SCHEMA_VERSION,
    runtime: {
      platformPackage: runtime.platformPackage,
      nativeBinaryDigest: runtime.binaryDigest,
      workers,
      platformPackages: runtime.platformPackages,
      platformPackagesDigest: runtime.platformPackagesDigest,
    },
    execution: {
      kind: executionKind,
    },
    config: {
      digest: sha256(fs.readFileSync(absoluteConfig)),
      path: normalizePath(path.relative(root, absoluteConfig)),
    },
    scope: {
      roots: population.roots,
      populationCount: population.count,
      populationDigest: population.digest,
    },
  };
}
