import {
  createExecutionFingerprint,
  recordSuccessfulExecution,
  resolveReusableExecution,
} from './execution-cache.mjs';

const TYPECHECK_TOOL = 'verify-typecheck.mjs';
const TYPECHECK_MODE = 'workspace-state';
const TYPECHECK_CONFIG_FILES = [
  'tsconfig.json',
  'tsconfig.node.json',
  'apps/extension/vite.config.ts',
  'apps/extension/build/content-runtime-build-id.ts',
  'apps/extension/build/injected-build.ts',
  'apps/extension/build/injected-build-shim-guard.ts',
  'apps/extension/build/layout.data.json',
  'apps/extension/build/layout.ts',
  'apps/extension/build/extension-html-inputs.ts',
  'tooling/qa/core/typecheck-project-definitions.mjs',
  'tooling/qa/core/typecheck-project-map.mjs',
  'tooling/qa/core/verify-typecheck.mjs',
];

function createTypecheckKeyInputs({
  checkedProjectIds = [],
  mode = 'full',
  targetFiles = [],
} = {}) {
  return {
    checkedProjectIds: [...checkedProjectIds].sort(),
    mode,
    targetFiles: [...targetFiles].sort(),
  };
}

export function createTypecheckStateFingerprint({ cwd = process.cwd(), targetFiles = [] } = {}) {
  return createExecutionFingerprint({
    cwd,
    targetFiles,
    configFiles: TYPECHECK_CONFIG_FILES,
  });
}

export function recordSuccessfulTypecheck({
  checkedProjectIds = [],
  cwd = process.cwd(),
  mode = 'full',
  targetFiles = [],
  source = 'unknown',
} = {}) {
  return recordSuccessfulExecution({
    cwd,
    tool: TYPECHECK_TOOL,
    mode: TYPECHECK_MODE,
    source,
    targetFiles,
    configFiles: TYPECHECK_CONFIG_FILES,
    keyInputs: createTypecheckKeyInputs({ checkedProjectIds, mode, targetFiles }),
  });
}

export function resolveReusableTypecheckState({
  checkedProjectIds = [],
  cwd = process.cwd(),
  mode = 'full',
  targetFiles = [],
} = {}) {
  const reusableState = resolveReusableExecution({
    cwd,
    tool: TYPECHECK_TOOL,
    mode: TYPECHECK_MODE,
    targetFiles,
    configFiles: TYPECHECK_CONFIG_FILES,
    keyInputs: createTypecheckKeyInputs({ checkedProjectIds, mode, targetFiles }),
  });

  if (reusableState.matched) {
    return reusableState;
  }

  if (reusableState.reason === 'no cached execution state') {
    return {
      matched: false,
      reason: 'no cached typecheck state',
    };
  }

  return {
    matched: false,
    reason: 'workspace state changed since the last successful typecheck',
  };
}
