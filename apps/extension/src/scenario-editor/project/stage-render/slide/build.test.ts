import { expect, it } from 'vitest';
import {
  createScenarioSlide,
  createScenarioTextElement,
} from '../../../../features/scenario/project/v3';
import {
  clampScenarioSlideClickIndex,
  getScenarioSlideBuildStepSummaries,
  getScenarioSlideBuildStepSummary,
  isScenarioElementVisibleAtClick,
  resolveScenarioSlideClickIndex,
} from './build';

it('resolves click-index bounds and build visibility for slide fragments', () => {
  const element = createScenarioTextElement({
    build: { hideAtClick: 3, order: 1, showAtClick: 1 },
  });
  const slide = createScenarioSlide({ clicks: { count: 2, initialIndex: 1 } });

  expect(resolveScenarioSlideClickIndex(slide, undefined)).toBe(1);
  expect(resolveScenarioSlideClickIndex(slide, 99)).toBe(2);
  expect(clampScenarioSlideClickIndex(slide, -1)).toBe(0);
  expect(isScenarioElementVisibleAtClick(element, 0)).toBe(false);
  expect(isScenarioElementVisibleAtClick(element, 1)).toBe(true);
  expect(isScenarioElementVisibleAtClick(element, 3)).toBe(false);
});

it('summarizes build steps using explicit fragment order', () => {
  const early = createScenarioTextElement({
    build: { hideAtClick: null, order: 0, showAtClick: 1 },
  });
  const late = createScenarioTextElement({
    build: { hideAtClick: 3, order: 2, showAtClick: 2 },
  });
  const slide = createScenarioSlide({
    clicks: { count: 3, initialIndex: 0 },
    elements: [
      { ...late, id: 'late' },
      { ...early, id: 'early' },
    ],
  });

  expect(getScenarioSlideBuildStepSummary(slide, 2)).toMatchObject({
    enteringElementIds: ['late'],
    hiddenElementIds: [],
    visibleElementIds: ['early', 'late'],
  });
  expect(getScenarioSlideBuildStepSummary(slide, 3).exitingElementIds).toEqual(['late']);
  expect(getScenarioSlideBuildStepSummaries(slide).map((step) => step.clickIndex)).toEqual([
    0, 1, 2, 3,
  ]);
});
