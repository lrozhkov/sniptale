import { expect, it } from 'vitest';

import {
  detectPhysicalCoreCount,
  resolveQaReleaseResourceProfile,
  resolveQaResourceProfile,
} from './resource-profile.mjs';

const CPU_INFO = Array.from({ length: 12 }, (_, index) => {
  return `processor : ${index}\nphysical id : 0\ncore id : ${Math.floor(index / 2)}`;
}).join('\n\n');

it('detects physical cores separately from SMT threads', () => {
  expect(detectPhysicalCoreCount(CPU_INFO, 12)).toBe(6);
});

it('selects the bounded i7/WSL default profile', () => {
  expect(
    resolveQaResourceProfile({
      cpuInfo: CPU_INFO,
      env: {},
      logicalCpuCount: 12,
      totalMemoryBytes: 16 * 1024 * 1024 * 1024,
    })
  ).toMatchObject({
    cpuTokens: 8,
    logicalCpuCount: 12,
    memoryMiB: 12 * 1024,
    physicalCoreCount: 6,
    vitestMaxWorkers: 4,
  });
});

it('gives the dedicated release test stage all bounded WSL-visible capacity', () => {
  expect(
    resolveQaReleaseResourceProfile({
      cpuInfo: CPU_INFO,
      env: {},
      logicalCpuCount: 12,
      totalMemoryBytes: 16 * 1024 * 1024 * 1024,
    })
  ).toMatchObject({
    cpuTokens: 12,
    memoryMiB: 15 * 1024,
    vitestMaxWorkers: 12,
  });
});

it('rejects a release CPU override below the non-test lane floor', () => {
  expect(() =>
    resolveQaReleaseResourceProfile({
      cpuInfo: CPU_INFO,
      env: { SNIPTALE_QA_CPU_TOKENS: '1' },
      logicalCpuCount: 12,
      totalMemoryBytes: 16 * 1024 * 1024 * 1024,
    })
  ).toThrow(/at least 2 for ci:release/u);
});

it('clamps explicit overrides to WSL-visible resources', () => {
  expect(
    resolveQaResourceProfile({
      cpuInfo: CPU_INFO,
      env: {
        SNIPTALE_QA_CPU_TOKENS: '32',
        SNIPTALE_QA_MEMORY_MIB: '20000',
        SNIPTALE_QA_VITEST_MAX_WORKERS: '9',
      },
      logicalCpuCount: 12,
      totalMemoryBytes: 16 * 1024 * 1024 * 1024,
    })
  ).toMatchObject({
    cpuTokens: 12,
    memoryMiB: 15 * 1024,
    vitestMaxWorkers: 9,
  });
});

it('rejects malformed operator limits instead of silently becoming unbounded', () => {
  expect(() =>
    resolveQaResourceProfile({
      cpuInfo: CPU_INFO,
      env: { SNIPTALE_QA_CPU_TOKENS: 'auto' },
      logicalCpuCount: 12,
      totalMemoryBytes: 16 * 1024 * 1024 * 1024,
    })
  ).toThrow(/positive integer/u);
});

it('keeps the smallest supported override executable and rejects unsafe memory budgets', () => {
  expect(
    resolveQaResourceProfile({
      cpuInfo: CPU_INFO,
      env: {
        SNIPTALE_QA_CPU_TOKENS: '1',
        SNIPTALE_QA_MEMORY_MIB: '6144',
      },
      logicalCpuCount: 12,
      totalMemoryBytes: 16 * 1024 * 1024 * 1024,
    })
  ).toMatchObject({ cpuTokens: 1, memoryMiB: 6144, vitestMaxWorkers: 1 });

  expect(() =>
    resolveQaResourceProfile({
      cpuInfo: CPU_INFO,
      env: { SNIPTALE_QA_MEMORY_MIB: '4096' },
      logicalCpuCount: 12,
      totalMemoryBytes: 16 * 1024 * 1024 * 1024,
    })
  ).toThrow(/at least 6144/u);

  expect(() =>
    resolveQaResourceProfile({
      cpuInfo: CPU_INFO,
      env: {},
      logicalCpuCount: 12,
      totalMemoryBytes: 6 * 1024 * 1024 * 1024,
    })
  ).toThrow(/requires at least 7168 MiB visible memory/u);
});
