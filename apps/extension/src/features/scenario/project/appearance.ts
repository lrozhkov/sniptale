import type {
  GuideAppearanceTemplate,
  GuideProject,
  GuideStep,
  GuideStyle,
  GuideStyleOverrides,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import { parseGuideTemplateJson } from '@sniptale/runtime-contracts/scenario/guide-parser';

/** Missing override keys inherit; explicit null restores the theme's default accent. */
export function resolveGuideStyle(
  base: GuideStyle,
  overrides: GuideStyleOverrides = {}
): GuideStyle {
  return {
    theme: overrides.theme ?? base.theme,
    font: overrides.font ?? base.font,
    density: overrides.density ?? base.density,
    contentWidth: overrides.contentWidth ?? base.contentWidth,
    imageBorder: overrides.imageBorder ?? base.imageBorder,
    numberStyle: overrides.numberStyle ?? base.numberStyle,
    accentColor: overrides.accentColor === undefined ? base.accentColor : overrides.accentColor,
  };
}

/** Copies only reusable appearance, excluding every private content and resource field. */
export function createGuideAppearanceTemplate(
  project: GuideProject,
  step: GuideStep,
  name: string
) {
  return parseGuideTemplateJson(
    JSON.stringify({
      format: 'sniptale-guide-template',
      version: 1,
      name: name.trim(),
      layout: step.layout,
      showNumber: step.showNumber,
      style: resolveGuideStyle(project.style, step.styleOverrides),
    })
  );
}

/** Inline values make the applied template independent of its original local file. */
export function applyGuideAppearanceTemplate(
  step: GuideStep,
  template: GuideAppearanceTemplate
): GuideStep {
  return {
    ...step,
    layout: template.layout,
    showNumber: template.showNumber,
    templateId: null,
    styleOverrides: { ...template.style },
  };
}
