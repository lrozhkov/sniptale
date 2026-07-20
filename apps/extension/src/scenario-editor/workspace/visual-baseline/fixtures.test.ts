import { describe, expect, it } from 'vitest';
import {
  createScenarioVisualBaselineAssets,
  createScenarioVisualBaselineProject,
  SCENARIO_VISUAL_BASELINE_PROJECT_ID,
  SCENARIO_VISUAL_BASELINE_SLIDE_IDS,
} from './fixtures';

describe('scenario editor visual baseline fixtures', () => {
  it('covers the required presentation reference flows', () => {
    const project = createScenarioVisualBaselineProject();
    const slideIds = project.slides.map((slide) => slide.id);

    expect(project.id).toBe(SCENARIO_VISUAL_BASELINE_PROJECT_ID);
    expect(slideIds).toEqual([
      SCENARIO_VISUAL_BASELINE_SLIDE_IDS.capturedApp,
      SCENARIO_VISUAL_BASELINE_SLIDE_IDS.emptyViewport,
      SCENARIO_VISUAL_BASELINE_SLIDE_IDS.stepOne,
      SCENARIO_VISUAL_BASELINE_SLIDE_IDS.stepTwoBuild,
      SCENARIO_VISUAL_BASELINE_SLIDE_IDS.stepThree,
      SCENARIO_VISUAL_BASELINE_SLIDE_IDS.importedImage,
    ]);
    expect(project.slides[3]?.clicks.count).toBe(3);
    expect(project.slides[3]?.elements.some((element) => element.build.showAtClick > 0)).toBe(true);
  });

  it('provides assets for existing image elements so screenshots catch broken placeholders', async () => {
    const project = createScenarioVisualBaselineProject();
    const assets = createScenarioVisualBaselineAssets(project.id);
    const assetIds = new Set(assets.map((asset) => asset.id));
    const imageAssetIds = project.slides.flatMap((slide) =>
      slide.elements.flatMap((element) =>
        element.kind === 'image' ? [element.assetRef.assetId] : []
      )
    );

    expect(assets).toHaveLength(2);
    expect(assets.map((asset) => asset.mimeType)).toEqual(['image/svg+xml', 'image/svg+xml']);
    await expect(assets[0]?.blob.text()).resolves.toContain('Customer workspace');
    await expect(assets[1]?.blob.text()).resolves.toContain('Imported product screenshot');
    expect(imageAssetIds.every((assetId) => assetIds.has(assetId))).toBe(true);
  });
});
