import { expect, it } from 'vitest';

import {
  collectCandidateSeamEntries,
  collectResidualSeamEntries,
  collectSizeCostEntries,
  formatResidualSeamEntry,
  formatSizeCostEntry,
} from './residual-seams.helpers.mjs';

it('sorts residual seams by lines, then tokens, and formats non-zero token counts', () => {
  const entries = collectResidualSeamEntries({
    files: ['src/b.ts', 'src/a.ts', 'src/c.ts'],
    lineHotspots: [
      { file: 'src/a.ts', lines: 100 },
      { file: 'src/b.ts', lines: 100 },
      { file: 'src/c.ts', lines: 50 },
    ],
    tokenHotspots: [
      { file: 'src/a.ts', tokens: 1 },
      { file: 'src/b.ts', tokens: 10 },
      { file: 'src/c.ts', tokens: 0 },
    ],
    limit: 2,
  });

  expect(entries).toEqual([
    { file: 'src/b.ts', lines: 100, tokens: 10 },
    { file: 'src/a.ts', lines: 100, tokens: 1 },
  ]);
  expect(formatResidualSeamEntry(entries[0])).toBe('src/b.ts (100 lines, 10 tokens)');
});

it('collects size cost separately from candidate seams', () => {
  const entries = collectSizeCostEntries({
    classifyFile: (file) => (file.endsWith('.data.ts') ? 'data' : 'production'),
    files: ['src/a.ts', 'src/b.data.ts', 'src/c.ts'],
    lineHotspots: [
      { file: 'src/a.ts', lines: 120 },
      { file: 'src/b.data.ts', lines: 260 },
      { file: 'src/c.ts', lines: 210 },
    ],
    tokenHotspots: [
      { file: 'src/a.ts', tokens: 1300 },
      { file: 'src/b.data.ts', tokens: 100 },
      { file: 'src/c.ts', tokens: 100 },
    ],
    limit: 3,
  });

  expect(entries.map(formatSizeCostEntry)).toEqual([
    'src/b.data.ts(260l/100t:data)',
    'src/a.ts(120l/1300t)',
    'src/c.ts(210l/100t)',
  ]);
});

it('uses explicit actionability signals for candidate seams', () => {
  const signalMap = new Map([
    ['src/a.ts', new Set(['guardrail:unsafe-boundary'])],
    ['src/b.data.ts', new Set(['guardrail:unsafe-boundary'])],
    ['src/test-support.ts', new Set(['guardrail:unsafe-boundary'])],
  ]);

  const entries = collectCandidateSeamEntries({
    classifyFile: (file) => {
      if (file.endsWith('.data.ts')) {
        return 'data';
      }
      return file.includes('test-support') ? 'support' : 'production';
    },
    files: ['src/a.ts', 'src/b.data.ts', 'src/test-support.ts'],
    lineHotspots: [{ file: 'src/a.ts', lines: 80 }],
    signalMap,
    tokenHotspots: [],
    limit: 3,
  });

  expect(entries).toEqual([
    {
      file: 'src/a.ts',
      kind: 'production',
      lines: 80,
      reasons: ['guardrail:unsafe-boundary'],
      tokens: 0,
    },
  ]);
});

it('prioritizes direct boundary seams ahead of topology-only candidates', () => {
  const signalMap = new Map([
    ['src/topology.ts', new Set(['topology:broad-public-surface-return'])],
    ['src/boundary.ts', new Set(['direct-seam:boundary-json-parse-cast'])],
  ]);

  const entries = collectCandidateSeamEntries({
    files: ['src/topology.ts', 'src/boundary.ts'],
    lineHotspots: [],
    signalMap,
    tokenHotspots: [],
    limit: 2,
  });

  expect(entries.map((entry) => entry.file)).toEqual(['src/boundary.ts', 'src/topology.ts']);
});
