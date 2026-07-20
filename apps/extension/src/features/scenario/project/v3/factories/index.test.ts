import { expect, it } from 'vitest';

import {
  createScenarioArrowElement,
  createScenarioCalloutElement,
  createScenarioCodeElement,
  createScenarioImageElement,
  createScenarioLineElement,
  createScenarioProjectV3,
  createScenarioShapeElement,
  createScenarioSlide,
  createScenarioTextElement,
} from './index';

it('creates a v3 project with a default slide', () => {
  const project = createScenarioProjectV3('Demo');

  expect(project.version).toBe(3);
  expect(project.slides).toHaveLength(1);
  expect(project.slides[0]?.title).toBe('Demo');
  expect(project.presentation).toMatchObject({
    backgroundTransition: { kind: 'fade' },
    controls: { loop: false, showControls: true, showProgress: true },
    defaultLayoutId: 'blank',
    grid: { columns: 12, gutter: 24, margin: 64, rows: 8 },
    themeId: 'editorial-warm',
    transition: { kind: 'fade' },
  });
  expect(project.templateLibraries).toEqual([]);
});

it('falls back to an untitled default slide for blank project names', () => {
  const project = createScenarioProjectV3('');

  expect(project.name).toBe('');
  expect(project.slides[0]?.title).toBe('Untitled scenario');
});

it('creates a slide with stable canvas defaults', () => {
  const slide = createScenarioSlide({ title: 'Intro' });

  expect(slide.title).toBe('Intro');
  expect(slide.canvas).toMatchObject({
    height: 720,
    width: 1280,
  });
  expect(slide).toMatchObject({
    backgroundTransition: { kind: 'fade' },
    clicks: { count: 0, initialIndex: 0 },
    guide: null,
    layout: { compositionPreset: 'freeform', layoutId: 'blank' },
    source: { kind: 'manual' },
    transition: { kind: 'fade' },
  });
  expect(slide.elements).toEqual([]);
});

it('creates every v1 element kind with UI-owned defaults', () => {
  const elements = [
    createScenarioTextElement(),
    createScenarioImageElement(),
    createScenarioShapeElement(),
    createScenarioLineElement(),
    createScenarioArrowElement(),
    createScenarioCalloutElement(),
    createScenarioCodeElement(),
  ];

  expect(elements.map((element) => element.kind)).toEqual([
    'text',
    'image',
    'shape',
    'line',
    'arrow',
    'callout',
    'code',
  ]);
  expect(elements.every((element) => element.visible && !element.locked)).toBe(true);
  expect(elements.every((element) => element.stylePresetId === null)).toBe(true);
  expect(elements.every((element) => element.build.showAtClick === 0)).toBe(true);
  expect(elements.every((element) => element.animation.preset === 'none')).toBe(true);
});
