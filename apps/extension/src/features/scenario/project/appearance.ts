import type {
  GuideProject,
  GuideTextStyle,
  GuideStyle,
  GuideStyleOverrides,
} from '@sniptale/runtime-contracts/scenario/types/guide';

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

/** Applies one default-style edit; resetting overrides preserves layout, numbering and content. */
export function applyGuideDefaultStyle(
  project: GuideProject,
  style: GuideStyle,
  resetSteps: boolean
): GuideProject {
  return {
    ...project,
    style: { ...style },
    items: resetSteps
      ? project.items.map((item) => (item.kind === 'step' ? { ...item, styleOverrides: {} } : item))
      : project.items,
  };
}

/** Safe shared prose semantics for editor, reader and export rendering. */
export function resolveGuideTextStyle(style?: GuideTextStyle) {
  return {
    scale: { small: 0.875, normal: 1, large: 1.25 }[style?.size ?? 'normal'],
    alignment: style?.alignment ?? 'start',
  };
}
