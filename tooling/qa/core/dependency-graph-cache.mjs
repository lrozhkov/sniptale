import { recordSuccessfulExecution, resolveReusableExecution } from './execution-cache.mjs';

const REPO_WIDE_GRAPH_MODE = 'repo-wide';
const BOUNDARY_TOOL = 'verify-boundaries.mjs';
const CYCLE_TOOL = 'verify-cycles.mjs';
const BOUNDARY_CONFIG_FILES = [
  '.dependency-cruiser.cjs',
  'tooling/qa/core/dependency-cruiser-options.cjs',
  'tooling/qa/core/dependency-cruiser-default-rules.cjs',
  'tooling/qa/core/dependency-graph-runner.mjs',
  'tooling/qa/core/runtime-topology.data.json',
  'tooling/qa/guards/architecture/verify-boundaries.mjs',
  'tooling/qa/guards/architecture/verify-cycles.mjs',
  'tsconfig.json',
  'package.json',
];
const CYCLE_CONFIG_FILES = BOUNDARY_CONFIG_FILES;

function createGraphKeyInputs(targetFiles = []) {
  return {
    targetFiles: [...targetFiles].sort(),
  };
}

export function recordSuccessfulBoundaryCheck({
  cwd = process.cwd(),
  targetFiles = [],
  source = 'unknown',
} = {}) {
  return recordSuccessfulExecution({
    cwd,
    tool: BOUNDARY_TOOL,
    mode: REPO_WIDE_GRAPH_MODE,
    source,
    targetFiles,
    configFiles: BOUNDARY_CONFIG_FILES,
    keyInputs: createGraphKeyInputs(targetFiles),
  });
}

export function resolveReusableBoundaryCheck({ cwd = process.cwd(), targetFiles = [] } = {}) {
  return resolveReusableExecution({
    cwd,
    tool: BOUNDARY_TOOL,
    mode: REPO_WIDE_GRAPH_MODE,
    targetFiles,
    configFiles: BOUNDARY_CONFIG_FILES,
    keyInputs: createGraphKeyInputs(targetFiles),
  });
}

export function recordSuccessfulCycleCheck({
  cwd = process.cwd(),
  targetFiles = [],
  source = 'unknown',
} = {}) {
  return recordSuccessfulExecution({
    cwd,
    tool: CYCLE_TOOL,
    mode: REPO_WIDE_GRAPH_MODE,
    source,
    targetFiles,
    configFiles: CYCLE_CONFIG_FILES,
    keyInputs: createGraphKeyInputs(targetFiles),
  });
}

export function resolveReusableCycleCheck({ cwd = process.cwd(), targetFiles = [] } = {}) {
  return resolveReusableExecution({
    cwd,
    tool: CYCLE_TOOL,
    mode: REPO_WIDE_GRAPH_MODE,
    targetFiles,
    configFiles: CYCLE_CONFIG_FILES,
    keyInputs: createGraphKeyInputs(targetFiles),
  });
}
