import crypto from 'node:crypto';

import { mergeProcessCovs } from '@bcoe/v8-coverage';
import istanbulCoverage from 'istanbul-lib-coverage';
import { expect, it } from 'vitest';

import {
  accumulateDuration,
  assertSupportedVitestVersion,
  createCoverageMapIdentity,
  mergeRawProcessCoverages,
  parseCoverageProfileConcurrencies,
  readRawCoverageGroup,
  validateCoverageProfilePasses,
} from './profile-v8-coverage-provider.mjs';

const { createCoverageMap, createFileCoverage } = istanbulCoverage;

function createIdentity(filename = '/repo/file.ts') {
  const map = createCoverageMap({});
  map.addFileCoverage(createFileCoverage(filename));
  return createCoverageMapIdentity(map);
}

it('accepts only unique positive profiling concurrencies', () => {
  expect(parseCoverageProfileConcurrencies(undefined)).toEqual([4, 8, 12]);
  expect(parseCoverageProfileConcurrencies('12,4,8')).toEqual([12, 4, 8]);
  expect(() => parseCoverageProfileConcurrencies('4,4')).toThrow('unique positive integers');
  expect(() => parseCoverageProfileConcurrencies('4,0')).toThrow('unique positive integers');
});

it('creates a stable identity independent of coverage-map insertion order', () => {
  const first = createCoverageMap({});
  const second = createCoverageMap({});
  for (const filename of ['/repo/a.ts', '/repo/b.ts']) {
    first.addFileCoverage(createFileCoverage(filename));
  }
  for (const filename of ['/repo/b.ts', '/repo/a.ts']) {
    second.addFileCoverage(createFileCoverage(filename));
  }
  expect(createCoverageMapIdentity(first)).toEqual(createCoverageMapIdentity(second));
});

it('separates execution counts from covered and uncovered identity', () => {
  const first = createCoverageMap({});
  const second = createCoverageMap({});
  const firstCoverage = createFileCoverage('/repo/file.ts');
  const secondCoverage = createFileCoverage('/repo/file.ts');
  firstCoverage.data.statementMap = {
    0: { end: { line: 1 }, start: { column: 0, line: 1 } },
  };
  secondCoverage.data.statementMap = structuredClone(firstCoverage.data.statementMap);
  firstCoverage.data.s = { 0: 1 };
  secondCoverage.data.s = { 0: 20 };
  first.addFileCoverage(firstCoverage);
  second.addFileCoverage(secondCoverage);
  const firstIdentity = createCoverageMapIdentity(first);
  const secondIdentity = createCoverageMapIdentity(second);
  expect(firstIdentity.digest).not.toBe(secondIdentity.digest);
  expect(firstIdentity.semanticDigest).toBe(secondIdentity.semanticDigest);
  secondCoverage.data.s = { 0: 0 };
  expect(createCoverageMapIdentity(second).semanticDigest).not.toBe(firstIdentity.semanticDigest);
});

it('rejects processing passes whose coverage output differs', () => {
  const identity = createIdentity();
  expect(
    validateCoverageProfilePasses([
      { concurrency: 4, identity },
      { concurrency: 8, identity },
    ])
  ).toEqual(identity);
  expect(() =>
    validateCoverageProfilePasses([
      { concurrency: 4, identity },
      {
        concurrency: 8,
        identity: { ...identity, digest: crypto.randomBytes(32).toString('hex') },
      },
    ])
  ).toThrow('changed output');
});

it('fails closed when the private Vitest provider contract changes version', () => {
  expect(() => assertSupportedVitestVersion('4.2.0')).toThrow('requires');
  expect(() => assertSupportedVitestVersion('4.1.11')).not.toThrow();
});

it('accumulates raw merge timing across environment batches', () => {
  expect(accumulateDuration(accumulateDuration(undefined, 1.24), 2.34)).toBe(3.5);
});

it('preserves deterministic filename order across concurrent raw reads', async () => {
  const delays = new Map([
    ['a.json', 4],
    ['b.json', 2],
    ['c.json', 0],
  ]);
  const results = await readRawCoverageGroup({
    concurrency: 3,
    filenames: ['c.json', 'a.json', 'b.json'],
    readFile: async (filename: string) => {
      await new Promise((resolve) => setTimeout(resolve, delays.get(filename)));
      return JSON.stringify({ filename });
    },
  });
  expect(results).toEqual([{ filename: 'a.json' }, { filename: 'b.json' }, { filename: 'c.json' }]);
});

it('batch-merges raw V8 results identically to iterative accumulation', () => {
  const createProcessCoverage = (count: number, startOffset = 0) => ({
    result: [
      {
        functions: [
          {
            functionName: 'covered',
            isBlockCoverage: true,
            ranges: [{ count, endOffset: 20, startOffset: 0 }],
          },
        ],
        scriptId: `${count}`,
        startOffset,
        url: 'file:///repo/file.ts',
      },
    ],
  });
  const inputs = [
    createProcessCoverage(1, 7),
    createProcessCoverage(2, 7),
    createProcessCoverage(3, 7),
  ];
  let iterative = { result: [] };
  for (const input of structuredClone(inputs)) {
    iterative = mergeProcessCovs([iterative, input]);
    for (const script of iterative.result) {
      if (!script.startOffset) {
        script.startOffset = input.result.find(
          (candidate) => candidate.url === script.url
        )?.startOffset;
      }
    }
  }
  const batched = mergeRawProcessCoverages(structuredClone(inputs));
  expect(batched.result).toEqual(iterative.result);
  expect(batched.result[0].startOffset).toBe(7);
  const mixedOffsets = [createProcessCoverage(1, 7), createProcessCoverage(2, 8)];
  let iterativeMixed = { result: [] };
  for (const input of structuredClone(mixedOffsets)) {
    iterativeMixed = mergeProcessCovs([iterativeMixed, input]);
    for (const script of iterativeMixed.result) {
      if (!script.startOffset) {
        script.startOffset = input.result.find(
          (candidate) => candidate.url === script.url
        )?.startOffset;
      }
    }
  }
  expect(mergeRawProcessCoverages(structuredClone(mixedOffsets)).result).toEqual(
    iterativeMixed.result
  );
  expect(iterativeMixed.result[0].startOffset).toBe(8);
  const missingOffset = createProcessCoverage(1);
  delete missingOffset.result[0].startOffset;
  expect(() => mergeRawProcessCoverages([missingOffset])).toThrow(
    'Invalid V8 coverage startOffset'
  );
  expect(() =>
    mergeRawProcessCoverages([
      {
        ...createProcessCoverage(1),
        result: [{ ...createProcessCoverage(1).result[0], startOffset: NaN }],
      },
    ])
  ).toThrow('Invalid V8 coverage startOffset');
});
