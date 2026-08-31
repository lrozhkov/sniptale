import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { cruise, format } from 'dependency-cruiser';

import { PRODUCT_SOURCE_ROOTS } from '../repository/src-production-targets.mjs';

const require = createRequire(import.meta.url);
const config = require('../../../../.dependency-cruiser.cjs');
const GRAPH_SOURCE_PATTERN = /\.(?:[cm]?[jt]sx?)$/u;
const runtimeIdentities = new WeakMap();
let nextRuntimeIdentity = 1;

function assignRuntimeIdentity(value) {
  if (!runtimeIdentities.has(value)) runtimeIdentities.set(value, nextRuntimeIdentity++);
  return runtimeIdentities.get(value);
}

function stableConfigJson(value) {
  if (value instanceof RegExp) return JSON.stringify({ flags: value.flags, source: value.source });
  if (Array.isArray(value)) return `[${value.map(stableConfigJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableConfigJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function collectGraphSourceFiles(absoluteRoot, files = []) {
  if (!fs.existsSync(absoluteRoot)) return files;
  const entry = fs.statSync(absoluteRoot);
  if (entry.isFile()) {
    if (GRAPH_SOURCE_PATTERN.test(absoluteRoot)) files.push(absoluteRoot);
    return files;
  }
  for (const child of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    if (child.isSymbolicLink()) continue;
    collectGraphSourceFiles(path.join(absoluteRoot, child.name), files);
  }
  return files;
}

function resolveDependencyCruiserVersion() {
  let current = path.dirname(fileURLToPath(import.meta.resolve('dependency-cruiser')));
  while (current !== path.dirname(current)) {
    const packagePath = path.join(current, 'package.json');
    if (fs.existsSync(packagePath)) {
      const manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      if (manifest.name === 'dependency-cruiser' && typeof manifest.version === 'string') {
        return manifest.version;
      }
    }
    current = path.dirname(current);
  }
  throw new Error('Cannot resolve the installed dependency-cruiser version');
}

function collectGraphConfigInputs(configOverride) {
  const inputs = new Set(['package.json', '.dependency-cruiser.cjs']);
  const tsConfigPath = configOverride?.options?.tsConfig?.fileName;
  if (typeof tsConfigPath === 'string' && tsConfigPath.length > 0) inputs.add(tsConfigPath);
  return [...inputs].map((filePath) => path.resolve(filePath)).sort();
}

export function createGraphInputDigest({ configOverride, root, roots }) {
  const hash = crypto.createHash('sha256');
  hash.update(`dependency-cruiser=${resolveDependencyCruiserVersion()}\0`);
  hash.update(`${stableConfigJson(configOverride)}\0`);
  const selectedRoots = root == null ? roots : [root];
  hash.update(
    `roots=${selectedRoots
      .map((entry) => path.resolve(entry))
      .sort()
      .join('\0')}\0`
  );
  for (const filePath of collectGraphConfigInputs(configOverride)) {
    hash.update(`config=${path.relative(process.cwd(), filePath).replaceAll(path.sep, '/')}\0`);
    hash.update(fs.existsSync(filePath) ? fs.readFileSync(filePath) : '<missing>');
    hash.update('\0');
  }
  for (const filePath of selectedRoots
    .flatMap((selectedRoot) => collectGraphSourceFiles(path.resolve(selectedRoot)))
    .sort()) {
    hash.update(`${path.relative(process.cwd(), filePath).replaceAll(path.sep, '/')}\0`);
    hash.update(fs.readFileSync(filePath));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function createDependencyGraphArtifactStore() {
  const artifacts = new Map();
  let buildCount = 0;

  async function buildAndStore(inputDigest, build, validate) {
    buildCount += 1;
    const artifact = Promise.resolve()
      .then(build)
      .then((value) => {
        if (!validate(value, inputDigest)) {
          throw new Error(`Dependency graph artifact validation failed for ${inputDigest}`);
        }
        return value;
      })
      .catch((error) => {
        artifacts.delete(inputDigest);
        throw error;
      });
    artifacts.set(inputDigest, artifact);
    return artifact;
  }

  return Object.freeze({
    async ensureArtifact(inputDigest, build, { validate = () => true } = {}) {
      const cached = artifacts.get(inputDigest);
      if (cached) {
        const value = await cached;
        if (validate(value, inputDigest)) return value;
        artifacts.delete(inputDigest);
      }
      return buildAndStore(inputDigest, build, validate);
    },
    getStats: () => Object.freeze({ artifactCount: artifacts.size, buildCount }),
  });
}

const graphArtifactStore = createDependencyGraphArtifactStore();

function createRuleSet(sourceConfig) {
  return Object.fromEntries(
    ['forbidden', 'allowed', 'allowedSeverity', 'required']
      .filter((key) => sourceConfig[key] !== undefined)
      .map((key) => [key, sourceConfig[key]])
  );
}

export function createDependencyCruiserOptions({ config: sourceConfig = config } = {}) {
  return {
    ...(sourceConfig.options ?? {}),
    validate: true,
    ruleSet: createRuleSet(sourceConfig),
  };
}

function normalizeGraphPath(source) {
  const normalized = String(source)
    .replace(/\\/gu, '/')
    .replace(/^[.][/]/u, '');
  const cwd = process.cwd().replace(/\\/gu, '/');

  if (path.isAbsolute(source) && normalized.startsWith(`${cwd}/`)) {
    return normalized.slice(cwd.length + 1);
  }

  for (const anchor of ['/apps/extension/src/', '/src/', '/tooling/']) {
    const index = normalized.indexOf(anchor);
    if (index >= 0) {
      return normalized.slice(index + 1);
    }
  }

  return normalized;
}

function closeCycle(chain) {
  if (chain.length > 1 && chain.at(0) !== chain.at(-1)) {
    return [...chain, chain[0]];
  }

  return chain;
}

function normalizeCycleChain(chain) {
  const uniqueChain = closeCycle(chain.map(normalizeGraphPath).filter(Boolean));
  if (uniqueChain.length <= 1) {
    return [];
  }

  const openChain =
    uniqueChain.at(0) === uniqueChain.at(-1) ? uniqueChain.slice(0, -1) : uniqueChain;
  const rotations = openChain.map((_, index) => [
    ...openChain.slice(index),
    ...openChain.slice(0, index),
  ]);
  const reversed = [...openChain].reverse();
  const reverseRotations = reversed.map((_, index) => [
    ...reversed.slice(index),
    ...reversed.slice(0, index),
  ]);
  const canonical = [...rotations, ...reverseRotations]
    .map((candidate) => closeCycle(candidate))
    .sort((left, right) => left.join('\0').localeCompare(right.join('\0')))[0];

  return canonical ?? [];
}

function createCycleKey(chain) {
  return chain.join('\0');
}

function getRuleName(violation) {
  return violation?.rule?.name ?? '';
}

function isCircularViolation(violation) {
  return violation?.type === 'cycle' || getRuleName(violation) === 'no-circular';
}

function extractViolationCycle(violation) {
  if (Array.isArray(violation?.cycle) && violation.cycle.length > 0) {
    return violation.cycle.map((entry) => entry.name);
  }

  if (typeof violation?.from === 'string' && typeof violation?.to === 'string') {
    return [violation.from, violation.to];
  }

  return [];
}

function extractDependencyCycle(moduleSource, dependency) {
  if (Array.isArray(dependency?.cycle) && dependency.cycle.length > 0) {
    return [moduleSource, ...dependency.cycle.map((entry) => entry.name)];
  }

  if (typeof dependency?.resolved === 'string') {
    return [moduleSource, dependency.resolved];
  }

  if (typeof dependency?.module === 'string') {
    return [moduleSource, dependency.module];
  }

  return [];
}

function addCycle(cyclesByKey, chain) {
  const normalized = normalizeCycleChain(chain);
  if (normalized.length > 0) {
    cyclesByKey.set(createCycleKey(normalized), normalized);
  }
}

export function extractCircularDependencyChains(cruiseOutput) {
  const cyclesByKey = new Map();

  for (const violation of cruiseOutput?.summary?.violations ?? []) {
    if (isCircularViolation(violation)) {
      addCycle(cyclesByKey, extractViolationCycle(violation));
    }
  }

  for (const module of cruiseOutput?.modules ?? []) {
    for (const dependency of module.dependencies ?? []) {
      if (dependency.circular === true) {
        addCycle(cyclesByKey, extractDependencyCycle(module.source, dependency));
      }
    }
  }

  return [...cyclesByKey.values()].sort((left, right) =>
    left.join('\0').localeCompare(right.join('\0'))
  );
}

export async function runDependencyGraphCheck({
  root = null,
  roots = PRODUCT_SOURCE_ROOTS,
  configOverride = config,
  cruiseRunner = cruise,
  formatRunner = format,
} = {}) {
  const contentDigest = createGraphInputDigest({ configOverride, root, roots });
  const inputDigest = crypto
    .createHash('sha256')
    .update(
      `${contentDigest}\0${assignRuntimeIdentity(cruiseRunner)}\0${assignRuntimeIdentity(formatRunner)}`
    )
    .digest('hex');
  return graphArtifactStore.ensureArtifact(
    inputDigest,
    async () => {
      const cruiseResult = await cruiseRunner(
        root == null ? roots : [root],
        createDependencyCruiserOptions({ config: configOverride })
      );
      const cruiseOutput = cruiseResult.output;
      const formatted = await formatRunner(cruiseOutput, { outputType: 'err' });

      return Object.freeze({
        cruiseOutput,
        inputDigest,
        boundary: Object.freeze({
          output: formatted.output ?? '',
          exitCode: formatted.exitCode ?? 0,
        }),
        cycles: Object.freeze(
          extractCircularDependencyChains(cruiseOutput).map((cycle) => Object.freeze(cycle))
        ),
      });
    },
    {
      validate: (artifact, digest) =>
        artifact != null &&
        artifact.inputDigest === digest &&
        Array.isArray(artifact.cycles) &&
        artifact.boundary != null &&
        typeof artifact.boundary.output === 'string' &&
        Number.isInteger(artifact.boundary.exitCode),
    }
  );
}
