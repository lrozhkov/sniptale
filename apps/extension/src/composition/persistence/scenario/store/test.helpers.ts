import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
} from '../../../../features/scenario/project/public';

export function createScenarioStoreProjectFixture() {
  return createGuideProject('Scenario', 'project-1', 10);
}

export function createCapturedGuideStepFixture(assetId: string, title: string) {
  const step = createGuideStep(title, `step-${assetId}`);
  step.blocks.push(
    createGuideImageBlock({
      id: `image-${assetId}`,
      assetId,
      width: 100,
      height: 50,
      source: {
        kind: 'capture',
        captureSurface: 'visible',
        sourceKind: 'manual',
        page: {
          title: null,
          url: null,
          viewport: { x: 0, y: 0, width: 100, height: 50 },
          scrollX: 0,
          scrollY: 0,
          devicePixelRatio: 1,
        },
        target: null,
        interactionPoint: null,
        cursorPoint: null,
        captureMetadata: { pointerRange: null, scroll: null, trigger: 'pointer-up' },
      },
    })
  );
  return step;
}
