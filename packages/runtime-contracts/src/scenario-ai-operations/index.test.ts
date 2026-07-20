import { describe, expect, it } from 'vitest';
import { scenarioAiOperationsResponseSchema } from './index';

describe('scenario AI operation schemas', () => {
  it('accepts valid slide and element operations', () => {
    const result = scenarioAiOperationsResponseSchema.safeParse(createValidOperationsResponse());

    expect(result.success).toBe(true);
  });

  it('rejects unknown operations, unknown fields, and invalid geometry', () => {
    expect(
      scenarioAiOperationsResponseSchema.safeParse({
        operations: [{ slideId: 'slide-1', type: 'unknown' }],
      }).success
    ).toBe(false);
    expect(
      scenarioAiOperationsResponseSchema.safeParse({
        operations: [{ extra: true, slideId: 'slide-1', title: 'Title', type: 'setSlideTitle' }],
      }).success
    ).toBe(false);
    expect(
      scenarioAiOperationsResponseSchema.safeParse({
        operations: [
          {
            element: {
              frame: { height: -1, width: 240, x: 100, y: 100 },
              kind: 'text',
            },
            slideId: 'slide-1',
            type: 'addElement',
          },
        ],
      }).success
    ).toBe(false);
  });
});

it('validates the shared line and arrow geometry fields', () => {
  const frame = { height: 120, width: 240, x: 100, y: 100 };
  const lineFields = {
    dash: 'dashed',
    end: { x: 200, y: 200 },
    frame,
    start: { x: 10, y: 20 },
    strokeColor: '#fff',
    strokeWidth: 2,
  };
  const createOperation = (element: Record<string, unknown>) => ({
    element,
    slideId: 'slide-1',
    type: 'addElement',
  });

  expect(
    scenarioAiOperationsResponseSchema.safeParse({
      operations: [
        createOperation({ ...lineFields, kind: 'line' }),
        createOperation({ ...lineFields, head: 'both', kind: 'arrow' }),
      ],
    }).success
  ).toBe(true);
  expect(
    scenarioAiOperationsResponseSchema.safeParse({
      operations: [createOperation({ ...lineFields, head: 'invalid', kind: 'arrow' })],
    }).success
  ).toBe(false);
});

function createValidOperationsResponse() {
  return {
    operations: [
      {
        presentation: {
          backgroundTransition: { durationMs: 300, easing: 'ease', kind: 'fade' },
          controls: { loop: true },
          transition: { durationMs: 400, easing: 'ease-out', kind: 'zoom' },
        },
        type: 'setProjectPresentation',
      },
      { slideId: 'slide-1', title: 'Title', type: 'setSlideTitle' },
      { clicks: { count: 3, initialIndex: 1 }, slideId: 'slide-1', type: 'setSlideClicks' },
      {
        element: {
          build: { hideAtClick: null, order: 1, showAtClick: 0 },
          frame: { height: 120, width: 240, x: 100, y: 100 },
          kind: 'text',
          text: 'New text',
        },
        slideId: 'slide-1',
        type: 'addElement',
      },
      {
        animation: { durationMs: 240, easing: 'ease', preset: 'fade-up' },
        elementId: 'element-1',
        slideId: 'slide-1',
        type: 'setElementAnimation',
      },
    ],
  };
}
