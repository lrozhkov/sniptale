import { describe, expect, it } from 'vitest';
import { createScenarioSlide, createScenarioTextElement } from '../../features/scenario/project/v3';
import { resolveEditModeClickIndex } from './click-preview';

describe('resolveEditModeClickIndex', () => {
  it('uses the full build when no element is selected', () => {
    expect(
      resolveEditModeClickIndex({
        clickIndex: 0,
        selectedElement: null,
        slide: createSlide(),
      })
    ).toBe(3);
  });

  it('keeps a visible selected element at the requested click', () => {
    expect(
      resolveEditModeClickIndex({
        clickIndex: 2,
        selectedElement: createElement({ hideAtClick: null, showAtClick: 1 }),
        slide: createSlide(),
      })
    ).toBe(2);
  });

  it('moves hidden selected elements to their closest visible build click', () => {
    expect(
      resolveEditModeClickIndex({
        clickIndex: 3,
        selectedElement: createElement({ hideAtClick: 3, showAtClick: 1 }),
        slide: createSlide(),
      })
    ).toBe(2);
  });
});

function createSlide() {
  return createScenarioSlide({
    clicks: { count: 3, initialIndex: 0 },
    id: 'slide-1',
  });
}

function createElement(build: { hideAtClick: number | null; showAtClick: number }) {
  return createScenarioTextElement({
    build: {
      hideAtClick: build.hideAtClick,
      order: 0,
      showAtClick: build.showAtClick,
    },
  });
}
