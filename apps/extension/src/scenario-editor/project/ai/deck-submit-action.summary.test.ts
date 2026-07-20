import { expect, it } from 'vitest';

import { createScenarioTextElement } from '../../../features/scenario/project/v3';
import { summarizeScenarioAiOperation } from './deck-submit-action';

it('summarizes every v3 operation family for the AI panel', () => {
  const operations = [
    { presentation: {}, type: 'setProjectPresentation' },
    { slideId: 'slide-1', title: 'Title', type: 'setSlideTitle' },
    { notes: 'Notes', slideId: 'slide-1', type: 'setSlideNotes' },
    { canvasPatch: { width: 1280 }, slideId: 'slide-1', type: 'setSlideCanvas' },
    { layout: { layoutId: 'summary' }, slideId: 'slide-1', type: 'setSlideLayout' },
    {
      transition: { durationMs: 1, easing: 'ease', kind: 'fade' },
      slideId: 'slide-1',
      type: 'setSlideTransition',
    },
    {
      backgroundTransition: { durationMs: 1, easing: 'ease', kind: 'fade' },
      slideId: 'slide-1',
      type: 'setSlideBackgroundTransition',
    },
    { clicks: { count: 2 }, slideId: 'slide-1', type: 'setSlideClicks' },
    { element: createScenarioTextElement(), slideId: 'slide-1', type: 'addElement' },
    { elementId: 'el-1', patch: { name: 'Layer' }, slideId: 'slide-1', type: 'updateElement' },
    { elementId: 'el-1', slideId: 'slide-1', type: 'deleteElement' },
    { elementId: 'el-1', position: 0, slideId: 'slide-1', type: 'reorderElement' },
    {
      build: { hideAtClick: null, order: 1, showAtClick: 1 },
      elementId: 'el-1',
      slideId: 'slide-1',
      type: 'setElementBuild',
    },
    {
      animation: { durationMs: 1, easing: 'ease', preset: 'fade' },
      elementId: 'el-1',
      slideId: 'slide-1',
      type: 'setElementAnimation',
    },
    {
      contentTransform: { scale: 1 },
      elementId: 'image-1',
      slideId: 'slide-1',
      type: 'editImageTransform',
    },
  ] as Array<Parameters<typeof summarizeScenarioAiOperation>[0]>;

  expect(operations.map(summarizeScenarioAiOperation).every(Boolean)).toBe(true);
});
