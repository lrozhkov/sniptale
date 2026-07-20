import type {
  ScenarioProjectPresentationSettings,
  ScenarioProjectV3,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioAiOperation } from '@sniptale/runtime-contracts/scenario-ai-operations';
import { touchSlide } from './slide';

export function applyScenarioAiProjectPresentation(
  presentation: ScenarioProjectPresentationSettings,
  operations: ScenarioAiOperation[]
): ScenarioProjectPresentationSettings {
  let current = presentation;
  for (const operation of operations) {
    if (operation.type !== 'setProjectPresentation') {
      continue;
    }

    current = {
      ...current,
      backgroundTransition:
        operation.presentation.backgroundTransition ?? current.backgroundTransition,
      controls: {
        loop: operation.presentation.controls?.loop ?? current.controls.loop,
        showControls:
          operation.presentation.controls?.showControls ?? current.controls.showControls,
        showProgress:
          operation.presentation.controls?.showProgress ?? current.controls.showProgress,
      },
      defaultLayoutId: operation.presentation.defaultLayoutId ?? current.defaultLayoutId,
      grid: operation.presentation.grid
        ? mergeDefinedPatch(current.grid, operation.presentation.grid)
        : current.grid,
      themeId: operation.presentation.themeId ?? current.themeId,
      transition: operation.presentation.transition ?? current.transition,
    };
  }

  return current;
}

export function applyScenarioAiSlideClicks(
  slide: ScenarioProjectV3['slides'][number],
  operation: Extract<ScenarioAiOperation, { type: 'setSlideClicks' }>
) {
  return touchSlide({
    ...slide,
    clicks: {
      ...slide.clicks,
      count: operation.clicks.count,
      initialIndex: operation.clicks.initialIndex ?? slide.clicks.initialIndex,
    },
  });
}

export function applyScenarioAiSlideLayout(
  slide: ScenarioProjectV3['slides'][number],
  operation: Extract<ScenarioAiOperation, { type: 'setSlideLayout' }>
) {
  const { safeArea, ...layoutPatch } = operation.layout;
  return touchSlide({
    ...slide,
    layout: {
      ...mergeDefinedPatch(slide.layout, layoutPatch),
      safeArea: safeArea
        ? mergeDefinedPatch(slide.layout.safeArea, safeArea)
        : slide.layout.safeArea,
    },
  });
}

function mergeDefinedPatch<TBase extends object>(base: TBase, patch: object): TBase {
  return {
    ...base,
    ...(Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined)
    ) as Partial<TBase>),
  };
}
