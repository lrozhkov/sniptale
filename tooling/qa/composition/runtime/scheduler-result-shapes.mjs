export const COMMON_SCHEDULER_RESULT_SHAPES = Object.freeze({
  appOwners: { ownerStep: 'step' },
  targetPaths: { ownerStep: 'step' },
  typecheck: { typecheckStep: 'step' },
  tests: { testSteps: 'steps' },
  lint: {
    loggingStep: 'step',
    oxlintStep: 'step',
    securityStep: 'step',
  },
  graph: { dependencySteps: 'steps', deadExportsStep: 'step' },
});
