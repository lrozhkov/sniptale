import { expect, it } from 'vitest';
import {
  createScenarioImageElement,
  createScenarioShapeElement,
  createScenarioSlide,
  createScenarioTextElement,
} from '../../../../features/scenario/project/v3';
import { listBundledScenarioTemplates } from '../../../../features/scenario/project/v3/templates';
import { applyScenarioAiCanvasPatch } from './handlers/canvas';
import {
  applyScenarioAiElementPatch,
  createScenarioAiElement,
  reorderScenarioAiElement,
} from './handlers/element';
import {
  addScenarioAiElementToSlide,
  deleteScenarioAiElementFromSlide,
  reorderScenarioAiElementInSlide,
  updateScenarioAiElementInSlide,
} from './handlers/slide';
import { applyScenarioAiTemplate } from './handlers/template';

it('creates all AI element input kinds through the factory seam', () => {
  const frame = { height: 40, width: 120, x: 10, y: 20 };
  const kinds = ['text', 'image', 'shape', 'line', 'arrow', 'callout', 'code'] as const;

  expect(kinds.map((kind) => createScenarioAiElement({ frame, kind }).kind)).toEqual(kinds);
});

it('patches nested element fields while dropping undefined values', () => {
  const image = createScenarioImageElement({ contentTransform: { scale: 1, x: 0, y: 0 } });
  const callout = createScenarioTextElement({
    animation: { durationMs: 240, easing: 'ease', preset: 'fade' },
    build: { hideAtClick: null, order: 1, showAtClick: 0 },
  });
  const shape = createScenarioShapeElement({ fillColor: '#fff', strokeWidth: 2 });
  const patchedImage = applyScenarioAiElementPatch(image, {
    contentTransform: { scale: 1.5, x: undefined },
    frame: { width: 300 },
  });
  const patchedText = applyScenarioAiElementPatch(callout, {
    animation: { preset: 'fade-up' },
    build: { hideAtClick: 3, order: undefined },
  });
  const patchedShape = applyScenarioAiElementPatch(shape, { style: { color: '#111' } });

  expect(patchedImage).toMatchObject({
    contentTransform: { scale: 1.5, x: 0, y: 0 },
    frame: expect.objectContaining({ width: 300 }),
  });
  expect(patchedText).toMatchObject({
    animation: { preset: 'fade-up' },
    build: { hideAtClick: 3, order: 1 },
  });
  expect(patchedShape).toMatchObject({ fillColor: '#fff', strokeWidth: 2 });
});

it('applies slide element additions, updates, deletes, and reorders', () => {
  const text = { ...createScenarioTextElement({ text: 'Old' }), id: 'text-1' };
  const slide = createScenarioSlide({ elements: [text] });
  const added = addScenarioAiElementToSlide({
    element: { frame: { height: 60, width: 160, x: 1, y: 2 }, kind: 'shape' },
    position: 0,
    slide,
  });
  const updated = updateScenarioAiElementInSlide({
    elementId: 'text-1',
    patch: { text: 'New' },
    slide: added,
  });
  const reordered = reorderScenarioAiElementInSlide({
    elementId: 'text-1',
    position: 0,
    slide: updated,
  });
  const deleted = deleteScenarioAiElementFromSlide({ elementId: 'text-1', slide: reordered });

  expect(updated.elements.find((element) => element.id === 'text-1')).toMatchObject({
    text: 'New',
  });
  expect(reordered.elements[0]?.id).toBe('text-1');
  expect(deleted.elements.map((element) => element.id)).not.toContain('text-1');
});

it('keeps invalid reorder requests unchanged', () => {
  const elements = [{ ...createScenarioTextElement(), id: 'text-1' }];

  expect(reorderScenarioAiElement(elements, 'missing', 0)).toBe(elements);
  expect(reorderScenarioAiElement(elements, 'text-1', 1)).toBe(elements);
});

it('patches canvas settings and applies only confirmed templates', () => {
  const slide = createScenarioSlide({ elements: [createScenarioTextElement({ role: 'old' })] });
  const template = listBundledScenarioTemplates()[0]!;
  const patchedCanvas = applyScenarioAiCanvasPatch(slide, {
    background: { color: '#111111', kind: 'solid' },
    height: 900,
  });

  expect(patchedCanvas.canvas).toMatchObject({ background: { color: '#111111' }, height: 900 });
  expect(applyScenarioAiTemplate({ confirmed: false, slide, template })).toBeNull();
  expect(applyScenarioAiTemplate({ confirmed: true, slide, template })).toMatchObject({
    templateId: template.templateId,
  });
  expect(
    applyScenarioAiTemplate({
      confirmed: true,
      slide,
      template: {
        ...template,
        slide: {
          ...template.slide,
          elements: [{ ...template.slide.elements[0]!, style: { align: 'middle' } }],
        },
      } as never,
    })
  ).toBeNull();
});
