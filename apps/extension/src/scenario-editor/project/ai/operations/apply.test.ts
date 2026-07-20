import { expect, it } from 'vitest';
import {
  createScenarioImageElement,
  createScenarioProjectV3,
  createScenarioTextElement,
} from '../../../../features/scenario/project/v3';
import { listBundledScenarioTemplates } from '../../../../features/scenario/project/v3/templates';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { applyScenarioAiOperations } from './apply';

function createProject(): ScenarioProjectV3 {
  const project = createScenarioProjectV3('AI project');
  return {
    ...project,
    id: 'project-1',
    slides: [
      {
        ...project.slides[0]!,
        elements: [
          {
            ...createScenarioTextElement({ role: 'title', text: 'Old title' }),
            id: 'text-1',
          },
        ],
        id: 'slide-1',
        title: 'Old slide',
      },
    ],
  };
}

it('applies valid operations transactionally', () => {
  const result = applyScenarioAiOperations({
    project: createProject(),
    response: {
      operations: [
        { slideId: 'slide-1', title: 'New slide', type: 'setSlideTitle' },
        {
          elementId: 'text-1',
          patch: { text: 'New text' },
          slideId: 'slide-1',
          type: 'updateElement',
        },
        {
          element: {
            frame: { height: 120, width: 240, x: 100, y: 240 },
            kind: 'callout',
            text: 'AI callout',
          },
          slideId: 'slide-1',
          type: 'addElement',
        },
        { notes: 'Speaker notes', slideId: 'slide-1', type: 'setSlideNotes' },
        {
          canvasPatch: { height: 900, width: 1440 },
          slideId: 'slide-1',
          type: 'setSlideCanvas',
        },
      ],
    },
    templates: listBundledScenarioTemplates(),
  });

  expect(result.status).toBe('applied');
  if (result.status !== 'applied') {
    throw new Error('Expected applied result');
  }
  expect(result.project.slides[0]?.title).toBe('New slide');
  expect(result.project.slides[0]?.notes).toBe('Speaker notes');
  expect(result.project.slides[0]?.canvas).toMatchObject({ height: 900, width: 1440 });
  expect(result.project.slides[0]?.elements).toHaveLength(2);
  expect(result.project.slides[0]?.elements[0]).toMatchObject({ text: 'New text' });
});

it('applies delete and reorder operations across existing elements', () => {
  const project = createProject();
  project.slides[0]!.elements.push({
    ...createScenarioImageElement(),
    id: 'image-1',
  });

  const result = applyScenarioAiOperations({
    project,
    response: {
      operations: [
        { elementId: 'image-1', position: 0, slideId: 'slide-1', type: 'reorderElement' },
        { elementId: 'text-1', slideId: 'slide-1', type: 'deleteElement' },
      ],
    },
    templates: listBundledScenarioTemplates(),
  });

  expect(result.status).toBe('applied');
  expect(result.project.slides[0]?.elements.map((element) => element.id)).toEqual(['image-1']);
});

it('rejects the whole batch when one operation is invalid', () => {
  const project = createProject();
  const result = applyScenarioAiOperations({
    project,
    response: {
      operations: [
        { slideId: 'slide-1', title: 'Should not apply', type: 'setSlideTitle' },
        {
          elementId: 'missing',
          patch: { text: 'Nope' },
          slideId: 'slide-1',
          type: 'updateElement',
        },
      ],
    },
    templates: listBundledScenarioTemplates(),
  });

  expect(result.status).toBe('rejected');
  expect(result.project).toBe(project);
});

it('rejects malformed responses, unknown slides, ranges, and unavailable templates', () => {
  const project = createProject();
  const responses = [
    { operations: [{ slideId: 'slide-1', type: 'unknown' }] },
    { operations: [{ slideId: 'missing', title: 'Nope', type: 'setSlideTitle' }] },
    {
      operations: [
        {
          element: { frame: { height: 10, width: 10, x: 0, y: 0 }, kind: 'text' },
          position: 99,
          slideId: 'slide-1',
          type: 'addElement',
        },
      ],
    },
    { operations: [{ slideId: 'slide-1', templateId: 'missing', type: 'setSlideTemplate' }] },
  ];

  for (const response of responses) {
    expect(
      applyScenarioAiOperations({ project, response, templates: listBundledScenarioTemplates() })
        .status
    ).toBe('rejected');
  }
});

it('rejects locked element mutation without an explicit unlock-only operation', () => {
  const project = createProject();
  project.slides[0]!.elements[0] = { ...project.slides[0]!.elements[0]!, locked: true };

  const result = applyScenarioAiOperations({
    project,
    response: {
      operations: [
        {
          elementId: 'text-1',
          patch: { text: 'Nope' },
          slideId: 'slide-1',
          type: 'updateElement',
        },
      ],
    },
    templates: listBundledScenarioTemplates(),
  });

  expect(result.status).toBe('rejected');
});

it('rejects image transform operations for non-image elements', () => {
  const result = applyScenarioAiOperations({
    project: createProject(),
    response: {
      operations: [
        {
          contentTransform: { scale: 1.2 },
          elementId: 'text-1',
          slideId: 'slide-1',
          type: 'editImageTransform',
        },
      ],
    },
    templates: listBundledScenarioTemplates(),
  });

  expect(result.status).toBe('rejected');
});

it('allows explicitly unlocking a locked element', () => {
  const project = createProject();
  project.slides[0]!.elements[0] = { ...project.slides[0]!.elements[0]!, locked: true };

  const result = applyScenarioAiOperations({
    project,
    response: {
      operations: [
        {
          elementId: 'text-1',
          patch: { locked: false },
          slideId: 'slide-1',
          type: 'updateElement',
        },
      ],
    },
    templates: listBundledScenarioTemplates(),
  });

  expect(result.status).toBe('applied');
});

it('requires confirmation for destructive template application', () => {
  const project = createProject();
  const template = listBundledScenarioTemplates().find((item) => item.templateId === 'blank')!;

  const rejected = applyScenarioAiOperations({
    project,
    response: {
      operations: [
        { slideId: 'slide-1', templateId: template.templateId, type: 'setSlideTemplate' },
      ],
    },
    templates: [template],
  });
  const applied = applyScenarioAiOperations({
    project,
    response: {
      operations: [
        {
          confirmed: true,
          slideId: 'slide-1',
          templateId: template.templateId,
          type: 'setSlideTemplate',
        },
      ],
    },
    templates: [template],
  });

  expect(rejected.status).toBe('rejected');
  expect(applied.status).toBe('applied');
});
