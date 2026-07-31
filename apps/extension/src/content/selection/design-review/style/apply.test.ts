// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import { applyPageStylePatch, preparePageStylePatchMutation } from './apply';

function appendVisible(element: HTMLElement): HTMLElement {
  const rect = DOMRect.fromRect({ height: 40, width: 80 });
  Object.defineProperty(element, 'getClientRects', {
    configurable: true,
    value: () => ({
      0: rect,
      [Symbol.iterator]: () => [rect][Symbol.iterator](),
      item: (index: number) => (index === 0 ? rect : null),
      length: 1,
    }),
  });
  document.body.append(element);
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
});

it('applies a validated direct declaration patch', () => {
  const element = appendVisible(document.createElement('div'));

  const result = applyPageStylePatch({
    element,
    operationId: 'review-1',
    patch: { declarations: [{ property: 'color', value: '#ff0000' }] },
  });

  expect(result.applied).toBe(true);
  expect(result.mutation?.declarations).toHaveLength(1);
  expect(element.style.color).toBe('rgb(255, 0, 0)');
});

it('rejects an unsafe-only patch before the mutation boundary', () => {
  const element = appendVisible(document.createElement('div'));

  const prepared = preparePageStylePatchMutation({
    element,
    operationId: 'review-2',
    patch: { declarations: [{ property: 'box-shadow', value: 'url(https://example.test/x)' }] },
  });
  const result = applyPageStylePatch({
    element,
    operationId: 'review-2',
    patch: { declarations: [{ property: 'box-shadow', value: 'url(https://example.test/x)' }] },
  });

  expect(prepared.diagnostics).toEqual([
    expect.objectContaining({ level: 'error', ruleId: 'review-2' }),
  ]);
  expect(prepared.input.declarations).toEqual([]);
  expect(result.applied).toBe(false);
  expect(result.mutation).toBeNull();
  expect(element.getAttribute('style')).toBeNull();
});

it('rejects a mixed valid and unsafe patch without applying its valid declaration', () => {
  const element = appendVisible(document.createElement('div'));

  const result = applyPageStylePatch({
    element,
    operationId: 'review-3',
    patch: {
      declarations: [
        { property: 'color', value: 'red' },
        { property: 'box-shadow', value: 'url(https://example.test/x)' },
      ],
    },
  });

  expect(result.applied).toBe(false);
  expect(result.mutation).toBeNull();
  expect(result.diagnostics).toEqual([
    expect.objectContaining({ level: 'error', ruleId: 'review-3' }),
  ]);
  expect(element.getAttribute('style')).toBeNull();
});

it('fails closed for a detached target', () => {
  const element = document.createElement('div');
  const result = applyPageStylePatch({
    element,
    operationId: 'review-4',
    patch: { declarations: [{ property: 'color', value: 'red' }] },
  });

  expect(result.applied).toBe(false);
  expect(result.diagnostics).toEqual([
    expect.objectContaining({ level: 'error', message: expect.stringContaining('detached') }),
  ]);
});
