import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildTargetSnapshot, compareSnapshots } from './target-snapshots.mjs';

const SELECTION_MODE_FILE = 'apps/extension/src/content/selection/selection-mode.ts';
const SELECTION_MODE_ABSOLUTE_FILE = path.resolve(SELECTION_MODE_FILE);

function createSnapshot(overrides = {}) {
  return buildTargetSnapshot({
    label: 'snapshot',
    targetFiles: [SELECTION_MODE_FILE],
    allowances: [],
    eslintResults: [],
    aiViolations: [],
    activeViolations: [],
    activeSecurityViolations: [],
    lineHotspots: [],
    tokenHotspots: [],
    ...overrides,
  });
}

describe('compareSnapshots', () => {
  it('marks a cluster as burned down when warnings and baseline both drop', () => {
    const previous = createSnapshot({
      label: 'before',
      allowances: [{ rule: 'max-file-lines', file: SELECTION_MODE_FILE }],
      eslintResults: [
        {
          filePath: SELECTION_MODE_ABSOLUTE_FILE,
          warningCount: 15,
        },
      ],
      lineHotspots: [{ file: SELECTION_MODE_FILE, lines: 620 }],
    });
    const current = createSnapshot({
      label: 'after',
      eslintResults: [
        {
          filePath: SELECTION_MODE_ABSOLUTE_FILE,
          warningCount: 3,
        },
      ],
    });

    expect(compareSnapshots(previous, current)).toMatchObject({
      warningDelta: 12,
      baselineDelta: 1,
      hotspotDelta: 1,
      burnedDown: true,
    });
  });

  it('does not mark metric-only cleanup as burned down with topology blockers', () => {
    const previous = createSnapshot({
      label: 'before',
      lineHotspots: [{ file: SELECTION_MODE_FILE, lines: 620 }],
    });
    const current = createSnapshot({
      label: 'after',
      topologyBlockers: ['same broad owner contract remains'],
    });

    expect(compareSnapshots(previous, current)).toMatchObject({
      hotspotDelta: 1,
      topologyBlockerCount: 1,
      mechanicalSplitOnly: true,
      burnedDown: false,
    });
  });
});
