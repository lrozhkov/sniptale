import { expect, it } from 'vitest';
import { createGuideProject, createGuideStep } from './factories';
import { deleteScenarioStep, moveScenarioStep } from './step-mutations';

it('moves stable items across sections without mutating the source document', () => {
  const project = createGuideProject('Guide', 'project', 100);
  project.items = [
    createGuideStep('First', 'first'),
    { kind: 'section', id: 'section', title: '', paragraphs: [] },
    createGuideStep('Last', 'last'),
  ];
  const moved = moveScenarioStep(project, 'last', 0, 90);
  expect(moved.items.map((item) => item.id)).toEqual(['last', 'first', 'section']);
  expect(project.items.map((item) => item.id)).toEqual(['first', 'section', 'last']);
  expect(moved.updatedAt).toBe(101);
  expect(moved.items[0]).toBe(project.items[2]);
});

it('deletes exactly the selected item and leaves missing/invalid moves unchanged', () => {
  const project = createGuideProject('Guide', 'project', 100);
  project.items = [createGuideStep('', 'first'), createGuideStep('', 'second')];
  expect(deleteScenarioStep(project, 'missing').project).toBe(project);
  expect(moveScenarioStep(project, 'first', NaN)).toBe(project);
  expect(moveScenarioStep(project, 'missing', 0)).toBe(project);
  const result = deleteScenarioStep(project, 'first', 110);
  expect(result.deletedStep?.id).toBe('first');
  expect(result.project.items.map((item) => item.id)).toEqual(['second']);
  expect(project.items).toHaveLength(2);
});
