import { expect, it } from 'vitest';
import {
  createScenarioImageElement,
  createScenarioProjectV3,
  createScenarioTextElement,
} from '../../../../../features/scenario/project/v3';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { listBundledScenarioTemplates } from '../../../../../features/scenario/project/v3/templates';
import { applyScenarioAiOperations } from '../apply';

function createProject(): ScenarioProjectV3 {
  const project = createScenarioProjectV3('AI project');
  return {
    ...project,
    id: 'project-1',
    slides: [
      {
        ...project.slides[0]!,
        elements: [
          { ...createScenarioTextElement({ text: 'Old title' }), id: 'text-1' },
          { ...createScenarioImageElement(), id: 'image-1' },
        ],
        id: 'slide-1',
        title: 'Old slide',
      },
    ],
  };
}

it('applies presentation, build, animation, and image transform operations', () => {
  const result = applyScenarioAiOperations({
    project: createProject(),
    response: createPresentationOperationsResponse(),
    templates: listBundledScenarioTemplates(),
  });

  expect(result.status).toBe('applied');
  if (result.status !== 'applied') {
    throw new Error('Expected applied result');
  }
  expect(result.project.presentation).toMatchObject({
    backgroundTransition: { kind: 'fade' },
    controls: { loop: true, showControls: false, showProgress: false },
    defaultLayoutId: 'summary',
    grid: { columns: 8 },
    themeId: 'graphite',
    transition: { kind: 'zoom' },
  });
  expect(result.project.slides[0]).toMatchObject({
    backgroundTransition: { kind: 'zoom' },
    clicks: { count: 3, initialIndex: 1 },
    layout: {
      compositionPreset: 'technical-focus',
      layoutId: 'code-focus',
      safeArea: { left: 24, top: 32 },
    },
    transition: { kind: 'slide' },
  });
  expect(result.project.slides[0]?.elements[0]).toMatchObject({
    animation: { preset: 'fade-up' },
    build: { hideAtClick: 3, order: 2, showAtClick: 1 },
  });
  expect(result.project.slides[0]?.elements[1]).toMatchObject({
    contentTransform: { scale: 1.2, x: 8, y: -4 },
  });
});

it('preserves presentation and slide defaults for partial operation patches', () => {
  const project = createProject();
  const result = applyScenarioAiOperations({
    project,
    response: {
      operations: [
        { presentation: { grid: { rows: 9 } }, type: 'setProjectPresentation' },
        { layout: { layoutId: 'summary' }, slideId: 'slide-1', type: 'setSlideLayout' },
        { clicks: { count: 2 }, slideId: 'slide-1', type: 'setSlideClicks' },
      ],
    },
    templates: listBundledScenarioTemplates(),
  });

  expect(result.status).toBe('applied');
  if (result.status !== 'applied') {
    throw new Error('Expected applied result');
  }
  expect(result.project.presentation.controls).toEqual(project.presentation.controls);
  expect(result.project.presentation.grid.rows).toBe(9);
  expect(result.project.slides[0]?.clicks).toMatchObject({ count: 2, initialIndex: 0 });
  expect(result.project.slides[0]?.layout).toMatchObject({
    layoutId: 'summary',
    safeArea: project.slides[0]?.layout.safeArea,
  });
});

function createPresentationOperationsResponse() {
  return {
    operations: [...createPresentationDeckOperations(), ...createPresentationElementOperations()],
  };
}

function createPresentationDeckOperations() {
  return [
    {
      presentation: {
        backgroundTransition: { durationMs: 350, easing: 'ease', kind: 'fade' },
        controls: { loop: true, showControls: false, showProgress: false },
        defaultLayoutId: 'summary',
        grid: { columns: 8 },
        themeId: 'graphite',
        transition: { durationMs: 500, easing: 'ease-out', kind: 'zoom' },
      },
      type: 'setProjectPresentation',
    },
    {
      layout: {
        compositionPreset: 'technical-focus',
        layoutId: 'code-focus',
        safeArea: { left: 24, top: 32 },
      },
      slideId: 'slide-1',
      type: 'setSlideLayout',
    },
    { clicks: { count: 3, initialIndex: 1 }, slideId: 'slide-1', type: 'setSlideClicks' },
    {
      backgroundTransition: { durationMs: 350, easing: 'ease-in', kind: 'zoom' },
      slideId: 'slide-1',
      type: 'setSlideBackgroundTransition',
    },
    {
      transition: { durationMs: 450, easing: 'ease', kind: 'slide' },
      slideId: 'slide-1',
      type: 'setSlideTransition',
    },
  ];
}

function createPresentationElementOperations() {
  return [
    {
      build: { hideAtClick: 3, order: 2, showAtClick: 1 },
      elementId: 'text-1',
      slideId: 'slide-1',
      type: 'setElementBuild',
    },
    {
      animation: { durationMs: 240, easing: 'ease', preset: 'fade-up' },
      elementId: 'text-1',
      slideId: 'slide-1',
      type: 'setElementAnimation',
    },
    {
      contentTransform: { scale: 1.2, x: 8, y: -4 },
      elementId: 'image-1',
      slideId: 'slide-1',
      type: 'editImageTransform',
    },
  ];
}
