export const STRUCTURAL_RISK_LIMITS = {
  file: {
    advisoryScore: 4,
    hardLines: 800,
    longLines: 400,
    longScore: 5,
    hardScore: 8,
  },
  delta: {
    warning: 3,
    hard: 6,
  },
  cohesion: {
    low: 0.5,
    high: 0.7,
  },
};

export const FUNCTION_PROFILES = {
  default: {
    lines: [70, 140],
    statements: 60,
    cyclomatic: 10,
    cognitive: 15,
    nesting: 4,
    params: 5,
    effects: 3,
    state: 2,
    owners: 4,
    recovery: 2,
  },
  entrypoint: {
    lines: [40, 80],
    statements: 30,
    cyclomatic: 6,
    cognitive: 10,
    nesting: 3,
    params: 4,
    effects: 1,
    state: 1,
    owners: 3,
    recovery: 1,
  },
  react: {
    lines: [80, 150],
    statements: 65,
    cyclomatic: 10,
    cognitive: 15,
    nesting: 4,
    params: 5,
    effects: 3,
    state: 2,
    owners: 4,
    recovery: 2,
  },
  pure: {
    lines: [100, 180],
    statements: 90,
    cyclomatic: 12,
    cognitive: 18,
    nesting: 5,
    params: 6,
    effects: 0,
    state: 0,
    owners: 4,
    recovery: 3,
  },
  test: {
    lines: [130, 250],
    statements: 100,
    cyclomatic: 5,
    cognitive: 10,
    nesting: 3,
    params: 8,
    effects: null,
    state: null,
    owners: 8,
    recovery: null,
  },
  adapter: {
    lines: [70, 140],
    statements: 60,
    cyclomatic: 8,
    cognitive: 12,
    nesting: 4,
    params: 6,
    effects: 2,
    state: 1,
    owners: 3,
    recovery: 2,
  },
  orchestration: {
    lines: [120, 220],
    statements: 100,
    cyclomatic: 10,
    cognitive: 15,
    nesting: 4,
    params: 6,
    effects: 5,
    state: 3,
    owners: 5,
    recovery: 4,
  },
};

export const STRUCTURAL_ALLOWANCES_PATH = 'tooling/configs/qa/structural-risk-allowances.data.json';

export const JAVASCRIPT_FILE_PATTERN = /\.(?:[cm]?[jt]sx?|mjs|cjs)$/u;
export const TEST_FILE_PATTERN = /(?:^|\/)(?:__tests__\/|test\/)|\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const GENERATED_DATA_FILE_PATTERNS = [
  /(?:^|\/)(?:generated|fixtures?|snapshots?|catalog|registry)(?:\/|\.)/u,
  /\.(?:data|constants|generated)\.[cm]?[jt]sx?$/u,
  /\.d\.[cm]?ts$/u,
];

export function isGeneratedDataFile(relativePath) {
  return GENERATED_DATA_FILE_PATTERNS.some((pattern) => pattern.test(relativePath));
}

export const ORCHESTRATION_OWNER_PATTERNS = [
  /^apps\/extension\/src\/workflows?\//u,
  /^apps\/extension\/src\/background\/runtime\/routing\/action-kernel\//u,
  /^tooling\/qa\/wrappers\//u,
  /^tooling\/qa\/core\/verify-(?:all|focused|harness)[./]/u,
];

export const ADAPTER_OWNER_PATTERN =
  /(?:^|\/)(?:adapter|adapters|runtime-bindings|platform|infrastructure|ports?|drivers?|persistence)(?:\/|\.|$)/u;
export const ENTRYPOINT_PATTERN =
  /(?:^|\/)(?:index|main|entrypoint|routes?|facade)\.[cm]?[jt]sx?$|(?:^|\/)(?:routes?|facades?)\//u;
