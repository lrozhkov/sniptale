import fs from 'node:fs';
import os from 'node:os';

const MIB = 1024 * 1024;
const DEFAULT_CPU_TOKEN_CAP = 8;
const DEFAULT_MEMORY_CAP_MIB = 12 * 1024;
const RESERVED_SYSTEM_MEMORY_MIB = 3 * 1024;
const MIN_QA_MEMORY_MIB = 6144;
const DEFAULT_CONCURRENT_VITEST_WORKERS = 4;
const MAX_VITEST_WORKERS = 20;
const MAX_RELEASE_CPU_TOKENS = 24;
const MAX_RELEASE_VITEST_WORKERS = 20;

function readCpuInfo() {
  try {
    return fs.readFileSync('/proc/cpuinfo', 'utf8');
  } catch {
    return '';
  }
}

function parsePositiveInteger(value, label) {
  if (value == null || value === '') return null;
  if (!/^\d+$/u.test(value)) throw new Error(`${label} must be a positive integer.`);

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

export function detectPhysicalCoreCount(cpuInfo, logicalCpuCount) {
  const processors = cpuInfo.split(/\n\s*\n/u).filter(Boolean);
  const coreKeys = new Set();

  for (const processor of processors) {
    const physicalId = /^physical id\s*:\s*(.+)$/mu.exec(processor)?.[1];
    const coreId = /^core id\s*:\s*(.+)$/mu.exec(processor)?.[1];
    if (physicalId != null && coreId != null) coreKeys.add(`${physicalId}:${coreId}`);
  }

  if (coreKeys.size > 0) return Math.min(logicalCpuCount, coreKeys.size);
  return Math.max(1, Math.ceil(logicalCpuCount / 2));
}

function resolveCpuTokenBudget({ env, logicalCpuCount, physicalCoreCount }) {
  const requested = parsePositiveInteger(env.SNIPTALE_QA_CPU_TOKENS, 'SNIPTALE_QA_CPU_TOKENS');
  if (requested != null) return Math.min(requested, logicalCpuCount);

  const smtHeadroom = Math.min(2, Math.max(0, logicalCpuCount - physicalCoreCount));
  return Math.min(
    DEFAULT_CPU_TOKEN_CAP,
    logicalCpuCount,
    Math.max(1, physicalCoreCount + smtHeadroom)
  );
}

function resolveMaximumMemoryMiB(totalMemoryMiB) {
  const maximum = totalMemoryMiB - 1024;
  if (maximum < MIN_QA_MEMORY_MIB) {
    throw new Error(
      `QA requires at least ${MIN_QA_MEMORY_MIB + 1024} MiB visible memory to reserve ` +
        `${MIN_QA_MEMORY_MIB} MiB for verification.`
    );
  }
  return maximum;
}

function resolveMemoryBudgetMiB({ env, totalMemoryMiB }) {
  const requested = parsePositiveInteger(env.SNIPTALE_QA_MEMORY_MIB, 'SNIPTALE_QA_MEMORY_MIB');
  const maximum = resolveMaximumMemoryMiB(totalMemoryMiB);
  if (requested != null) {
    if (requested < MIN_QA_MEMORY_MIB) {
      throw new Error(`SNIPTALE_QA_MEMORY_MIB must be at least ${MIN_QA_MEMORY_MIB}.`);
    }
    return Math.min(requested, maximum);
  }

  return Math.min(
    DEFAULT_MEMORY_CAP_MIB,
    maximum,
    Math.max(MIN_QA_MEMORY_MIB, totalMemoryMiB - RESERVED_SYSTEM_MEMORY_MIB)
  );
}

function resolveVitestWorkers({ cpuTokens, env }) {
  const requested = parsePositiveInteger(
    env.SNIPTALE_QA_VITEST_MAX_WORKERS,
    'SNIPTALE_QA_VITEST_MAX_WORKERS'
  );
  const defaultWorkers = Math.max(1, Math.min(DEFAULT_CONCURRENT_VITEST_WORKERS, cpuTokens - 3));
  return Math.min(requested ?? defaultWorkers, MAX_VITEST_WORKERS, cpuTokens);
}

export function resolveQaResourceProfile({
  cpuInfo = readCpuInfo(),
  env = process.env,
  logicalCpuCount = os.availableParallelism?.() ?? os.cpus().length,
  totalMemoryBytes = os.totalmem(),
} = {}) {
  const normalizedLogicalCpuCount = Math.max(1, logicalCpuCount);
  const totalMemoryMiB = Math.max(1024, Math.floor(totalMemoryBytes / MIB));
  const physicalCoreCount = detectPhysicalCoreCount(cpuInfo, normalizedLogicalCpuCount);
  const cpuTokens = resolveCpuTokenBudget({
    env,
    logicalCpuCount: normalizedLogicalCpuCount,
    physicalCoreCount,
  });
  const memoryMiB = resolveMemoryBudgetMiB({ env, totalMemoryMiB });

  return Object.freeze({
    cpuTokens,
    logicalCpuCount: normalizedLogicalCpuCount,
    memoryMiB,
    physicalCoreCount,
    totalMemoryMiB,
    vitestMaxWorkers: resolveVitestWorkers({ cpuTokens, env }),
  });
}

export function resolveQaReleaseResourceProfile({
  cpuInfo = readCpuInfo(),
  env = process.env,
  logicalCpuCount = os.availableParallelism?.() ?? os.cpus().length,
  totalMemoryBytes = os.totalmem(),
} = {}) {
  const normalizedLogicalCpuCount = Math.max(1, logicalCpuCount);
  const totalMemoryMiB = Math.max(1024, Math.floor(totalMemoryBytes / MIB));
  const physicalCoreCount = detectPhysicalCoreCount(cpuInfo, normalizedLogicalCpuCount);
  if (normalizedLogicalCpuCount < 2) {
    throw new Error('ci:release requires at least 2 WSL-visible CPU tokens.');
  }
  const requestedCpuTokens = parsePositiveInteger(
    env.SNIPTALE_QA_CPU_TOKENS,
    'SNIPTALE_QA_CPU_TOKENS'
  );
  if (requestedCpuTokens != null && requestedCpuTokens < 2) {
    throw new Error('SNIPTALE_QA_CPU_TOKENS must be at least 2 for ci:release.');
  }
  const cpuTokens = Math.min(
    requestedCpuTokens ?? MAX_RELEASE_CPU_TOKENS,
    MAX_RELEASE_CPU_TOKENS,
    normalizedLogicalCpuCount
  );
  const requestedMemoryMiB = parsePositiveInteger(
    env.SNIPTALE_QA_MEMORY_MIB,
    'SNIPTALE_QA_MEMORY_MIB'
  );
  if (requestedMemoryMiB != null && requestedMemoryMiB < MIN_QA_MEMORY_MIB) {
    throw new Error(`SNIPTALE_QA_MEMORY_MIB must be at least ${MIN_QA_MEMORY_MIB}.`);
  }
  const maximumMemoryMiB = resolveMaximumMemoryMiB(totalMemoryMiB);
  const memoryMiB = Math.min(requestedMemoryMiB ?? maximumMemoryMiB, maximumMemoryMiB);
  const requestedVitestWorkers = parsePositiveInteger(
    env.SNIPTALE_QA_VITEST_MAX_WORKERS,
    'SNIPTALE_QA_VITEST_MAX_WORKERS'
  );
  const vitestMaxWorkers = Math.min(
    requestedVitestWorkers ?? cpuTokens,
    MAX_RELEASE_VITEST_WORKERS,
    cpuTokens
  );

  return Object.freeze({
    cpuTokens,
    logicalCpuCount: normalizedLogicalCpuCount,
    memoryMiB,
    physicalCoreCount,
    totalMemoryMiB,
    vitestMaxWorkers,
  });
}

export function formatQaResourceProfile(profile) {
  return [
    `cpu=${profile.cpuTokens}/${profile.logicalCpuCount}`,
    `physical=${profile.physicalCoreCount}`,
    `memory=${profile.memoryMiB}/${profile.totalMemoryMiB}MiB`,
    `vitest=${profile.vitestMaxWorkers}`,
  ].join('; ');
}
