export const SCENARIO_STAGE_OWNER_MAPPINGS = [
  {
    owner: 'scenario-stage-svg',
    productionPrefix: 'apps/extension/src/scenario-editor/project/stage-render/slide/svg/',
    reason: 'Scenario stage SVG rendering is covered through the consolidated stage SVG suite.',
    testFiles: [
      'apps/extension/src/scenario-editor/project/stage-render/index.test.ts',
      'apps/extension/src/scenario-editor/project/stage-render/slide/render.test.ts',
    ],
  },
  {
    owner: 'scenario-stage-render',
    productionPrefix: 'apps/extension/src/scenario-editor/project/stage-render/',
    reason:
      'Scenario-editor stage rendering is covered by render, SVG, overlay, and harness tests.',
    testFiles: [
      'apps/extension/src/scenario-editor/project/stage-render/index.test.ts',
      'apps/extension/src/scenario-editor/project/stage-render/overlays.test.ts',
      'apps/extension/src/scenario-editor/project/stage-render/slide/render.test.ts',
      'apps/extension/src/scenario-editor/project/stage-render/svg/index.test.ts',
      'apps/extension/src/scenario-editor/project/stage-render/svg-overlays.test.ts',
      'apps/extension/src/scenario-editor/project/stage-render/capture-composition.render.test.ts',
    ],
  },
];
