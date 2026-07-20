import path from 'node:path';
import { createRequire } from 'node:module';
import { cruise, format } from 'dependency-cruiser';

import { PRODUCT_SOURCE_ROOTS } from './src-production-targets.mjs';

const require = createRequire(import.meta.url);
const config = require('../../../.dependency-cruiser.cjs');

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
  const cruiseResult = await cruiseRunner(
    root == null ? roots : [root],
    createDependencyCruiserOptions({ config: configOverride })
  );
  const cruiseOutput = cruiseResult.output;
  const formatted = await formatRunner(cruiseOutput, { outputType: 'err' });

  return {
    cruiseOutput,
    boundary: {
      output: formatted.output ?? '',
      exitCode: formatted.exitCode ?? 0,
    },
    cycles: extractCircularDependencyChains(cruiseOutput),
  };
}
