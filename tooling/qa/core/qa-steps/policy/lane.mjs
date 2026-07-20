function checkpointRequiredBy() {
  return ['qa:checkpoint', 'qa:build', 'qa:closeout'];
}

const LANE_POLICY = {
  advisory: { runsIn: ['qa:advisory'], requiredBy: [], execution: 'advisory' },
  audit: { runsIn: ['qa:audit'], requiredBy: ['qa:audit'], execution: 'always' },
  build: { runsIn: ['qa:build'], requiredBy: ['qa:build', 'qa:closeout'], execution: 'always' },
  'build-commit': {
    runsIn: ['qa:build'],
    requiredBy: ['qa:closeout'],
    execution: 'conditional',
  },
  'focused-direct': {
    runsIn: ['qa:checkpoint'],
    requiredBy: checkpointRequiredBy(),
    execution: 'always',
  },
  closeout: {
    runsIn: ['qa:closeout'],
    requiredBy: ['qa:closeout'],
    execution: 'conditional',
  },
  e2e: { runsIn: ['qa:e2e'], requiredBy: ['qa:e2e'], execution: 'always' },
  'focused-guardrail': {
    runsIn: ['qa:checkpoint'],
    requiredBy: checkpointRequiredBy(),
    execution: 'always',
  },
  'focused-triggered': {
    runsIn: ['qa:checkpoint'],
    requiredBy: checkpointRequiredBy(),
    execution: 'conditional',
  },
  harness: {
    runsIn: ['qa:release-harness'],
    requiredBy: ['qa:release-harness', 'qa:checkpoint', 'qa:build', 'qa:release', 'qa:closeout'],
    execution: 'always',
  },
  manual: { runsIn: ['manual-audit'], requiredBy: [], execution: 'manual' },
  'release-direct': {
    runsIn: ['qa:release'],
    requiredBy: ['qa:release'],
    execution: 'always',
  },
  'release-guardrail': {
    runsIn: ['qa:release'],
    requiredBy: ['qa:release'],
    execution: 'always',
  },
  'wrapper-lifecycle': {
    runsIn: [],
    requiredBy: [],
    execution: 'always',
  },
};

export function resolveQaLanePolicy(lane) {
  return LANE_POLICY[lane];
}
