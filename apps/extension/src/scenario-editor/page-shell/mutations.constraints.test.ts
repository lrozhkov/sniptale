import { expect, it } from 'vitest';
import {
  createScenarioImageElement,
  createScenarioLineElement,
  createScenarioProjectV3,
  createScenarioShapeElement,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import type {
  ScenarioElement,
  ScenarioProjectV3,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  updateProjectPresentationSettings,
  updateSlideElement,
  updateSlideSettings,
} from './mutations';

function createProjectWithElements(elements: ScenarioElement[]): ScenarioProjectV3 {
  const project = createScenarioProjectV3('Constraints');
  return {
    ...project,
    slides: [{ ...project.slides[0]!, elements, id: 'slide-1' }],
  };
}

it('clamps slide canvas, click, and presentation grid settings in mutation owner', () => {
  const project = createProjectWithElements([]);
  const slideUpdated = updateSlideSettings(project, 'slide-1', {
    canvas: { height: 999999, width: 1 },
    clicks: { count: 999999, initialIndex: -50 },
  });
  const presentationUpdated = updateProjectPresentationSettings(slideUpdated, {
    grid: { columns: 999, gutter: -12, margin: 999, rows: 0 },
  });

  expect(presentationUpdated.slides[0]?.canvas).toMatchObject({ height: 4320, width: 320 });
  expect(presentationUpdated.slides[0]?.clicks).toMatchObject({ count: 999, initialIndex: 0 });
  expect(presentationUpdated.presentation.grid).toMatchObject({
    columns: 24,
    gutter: 0,
    margin: 320,
    rows: 1,
  });
});

it('clamps element frame, opacity, build, and typed style updates in mutation owner', () => {
  const text = { ...createScenarioTextElement({ text: 'Title' }), id: 'text-1' };
  const project = createProjectWithElements([text]);
  const updated = updateSlideElement(project, 'slide-1', 'text-1', {
    build: { hideAtClick: 10000, order: -1, showAtClick: -10 },
    frame: { height: -4, width: 999999, x: -999999, y: 999999 },
    opacity: 5,
    style: { fontSize: 1, fontWeight: 9999 },
  });

  expect(updated.slides[0]?.elements[0]).toMatchObject({
    build: { hideAtClick: 999, order: 0, showAtClick: 0 },
    frame: { height: 1, width: 7680, x: -7680, y: 7680 },
    opacity: 1,
    style: { fontSize: 8, fontWeight: 900 },
  });
});

it('clamps media transform and stroke-specific numeric element updates', () => {
  const image = { ...createScenarioImageElement(), id: 'image-1' };
  const line = { ...createScenarioLineElement(), id: 'line-1' };
  const shape = { ...createScenarioShapeElement(), id: 'shape-1' };
  const project = createProjectWithElements([image, line, shape]);
  const imageUpdated = updateSlideElement(project, 'slide-1', 'image-1', {
    contentTransform: { scale: 99, x: -999999, y: 999999 },
  });
  const lineUpdated = updateSlideElement(imageUpdated, 'slide-1', 'line-1', {
    strokeWidth: 0,
  });
  const shapeUpdated = updateSlideElement(lineUpdated, 'slide-1', 'shape-1', {
    cornerRadius: 999,
    strokeWidth: -5,
  });

  expect(shapeUpdated.slides[0]?.elements[0]).toMatchObject({
    contentTransform: { scale: 10, x: -7680, y: 7680 },
  });
  expect(shapeUpdated.slides[0]?.elements[1]).toMatchObject({ strokeWidth: 1 });
  expect(shapeUpdated.slides[0]?.elements[2]).toMatchObject({
    cornerRadius: 240,
    strokeWidth: 0,
  });
});
