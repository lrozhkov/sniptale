import { expect, it } from 'vitest';
import { createGuideProject, createTourDocument, createTourImageSlide } from './factories';
import { getScenarioNarrationText, listScenarioNarrationTexts } from './narration-text';

it('lists exact nonempty action texts in authored order and never substitutes a label', () => {
  const project = createGuideProject('Guide', 'p');
  const slide = createTourImageSlide('s');
  slide.actions = [
    {
      type: 'annotation',
      object: { id: 'a', text: '  Exact 👋\n', anchor: null, appearance: null },
    },
    {
      type: 'hotspot',
      object: {
        id: 'h',
        text: ' ',
        label: 'Never speak this label',
        point: { x: 0, y: 0 },
        targetRect: null,
        visual: { kind: 'point', pulse: false },
        appearance: null,
      },
    },
    { type: 'annotation', object: { id: 'b', text: 'Second', anchor: null, appearance: null } },
  ];
  project.tour = { ...createTourDocument(), slides: [slide] };
  const before = structuredClone(project);
  expect(listScenarioNarrationTexts(project)).toEqual([
    { slideId: 's', objectId: 'a', text: '  Exact 👋\n', narration: null },
    { slideId: 's', objectId: 'b', text: 'Second', narration: null },
  ]);
  expect(getScenarioNarrationText(project, { slideId: 's', objectId: 'h' })).toBeNull();
  expect(getScenarioNarrationText(project, { slideId: 'missing', objectId: 'a' })).toBeNull();
  expect(getScenarioNarrationText(project, { slideId: 's', objectId: 's' })).toBeNull();
  expect(project).toEqual(before);
  project.purpose = 'step-template';
  expect(listScenarioNarrationTexts(project)).toEqual([]);
});
